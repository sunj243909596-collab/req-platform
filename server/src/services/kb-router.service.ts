// 用户问题 → 选定知识库（LLM 路由 + 关键词兜底）
import type { LLMProvider } from "agent";
import { readConfig } from "./agent-config.service";
import { getLLM } from "./llm.service";
import type { KbRoutingExample } from "./kb-routing-examples";
import {
  applyMaxKbToSystemPrompt,
  buildKbRoutingCatalog,
  buildKbRoutingUserMessage,
  resolveKbRoutingSystemPrompt,
} from "./kb-routing-prompt";

// ---- LLM 路由结果缓存（10 分钟 TTL，最多 200 条） ----
interface RouteCacheEntry {
  result: KbRoutingResult;
  expiresAt: number;
}
const _routeCache = new Map<string, RouteCacheEntry>();
const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;

function buildRouteCacheKey(query: string, bases: KbRoutingCandidate[]): string {
  const q = query.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 80);
  const kbFp = bases.map((b) => b.id).sort((a, b) => a - b).join("-");
  return `${q}|${kbFp}`;
}

function getRouteCache(key: string): KbRoutingResult | null {
  const entry = _routeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _routeCache.delete(key); return null; }
  return entry.result;
}

function setRouteCache(key: string, result: KbRoutingResult): void {
  _routeCache.set(key, { result, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
  if (_routeCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of _routeCache) {
      if (v.expiresAt < now) _routeCache.delete(k);
    }
  }
}

export interface KbRoutingCandidate {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  routingExamples?: KbRoutingExample[] | null;
  docType: string | null;
  chunkCount: number;
  enabled: boolean;
}

export interface KbRoutingResult {
  kbIds: number[];
  labels: string[];
  reason: string;
  method: "llm" | "heuristic" | "single" | "configured" | "default" | "docType";
}

export interface KbRoutingStore {
  listKnowledgeBasesForRouting(): Promise<KbRoutingCandidate[]>;
}

function heuristicRoute(
  query: string,
  bases: KbRoutingCandidate[],
  maxKb: number
): KbRoutingResult {
  const q = query.toLowerCase();
  const tokens = (query.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9_]{2,}/g) ?? []).map((t) =>
    t.toLowerCase()
  );

  const scored = bases.map((b) => {
    const hay = `${b.displayName} ${b.name} ${b.description ?? ""} ${b.docType ?? ""}`.toLowerCase();
    let score = 0;
    if (hay.includes(q.slice(0, 20)) && q.length > 4) score += 3;
    for (const t of tokens) {
      if (t.length >= 2 && hay.includes(t)) score += 1;
    }
    if (b.chunkCount === 0) score -= 2;
    return { b, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score > 0).slice(0, maxKb);
  const pick = top.length > 0 ? top.map((s) => s.b) : [scored[0]?.b].filter(Boolean);

  return {
    kbIds: pick.map((b) => b.id),
    labels: pick.map((b) => b.displayName || b.name),
    reason: top.length > 0 ? "根据问题关键词匹配知识库名称/描述" : "未明显匹配，使用默认可用库",
    method: "heuristic",
  };
}

async function llmRoute(
  query: string,
  bases: KbRoutingCandidate[],
  llm: LLMProvider,
  maxKb: number
): Promise<KbRoutingResult | null> {
  const cfg = readConfig();
  const catalog = buildKbRoutingCatalog(bases);
  const systemPrompt = applyMaxKbToSystemPrompt(
    resolveKbRoutingSystemPrompt(cfg.kbRoutingSystemPrompt),
    maxKb
  );
  const userMessage = buildKbRoutingUserMessage(query, catalog, maxKb);

  try {
    const res = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature: 0.1,
      maxTokens: 256,
    });

    const jsonMatch = res.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { kbIds?: number[]; reason?: string };
    const validIds = new Set(bases.map((b) => b.id));
    const kbIds = (parsed.kbIds ?? [])
      .filter((id) => typeof id === "number" && validIds.has(id))
      .slice(0, maxKb);

    if (kbIds.length === 0) return null;

    const labels = kbIds.map((id) => {
      const b = bases.find((x) => x.id === id)!;
      return b.displayName || b.name;
    });

    return {
      kbIds,
      labels,
      reason: parsed.reason?.trim() || "LLM 路由",
      method: "llm",
    };
  } catch {
    return null;
  }
}

/**
 * 决定本次 RAG 检索使用哪些知识库
 * - 仅 1 个启用库：直接用
 * - 配置了 activeKnowledgeBaseId 且未强制多库路由：可仍走路由（用户希望智能选库时优先 routing）
 */
export async function routeKnowledgeBases(
  query: string,
  store: KbRoutingStore,
  options?: {
    explicitKbId?: number;
    llm?: LLMProvider;
    filter?: { docType?: string };
  }
): Promise<KbRoutingResult> {
  const cfg = readConfig();
  const rag = cfg.rag;
  const maxKb = rag.kbRoutingMaxKb ?? 2;

  if (options?.explicitKbId != null && options.explicitKbId > 0) {
    const bases = await store.listKnowledgeBasesForRouting();
    const b = bases.find((x) => x.id === options.explicitKbId);
    return {
      kbIds: [options.explicitKbId],
      labels: [b?.displayName || b?.name || `KB#${options.explicitKbId}`],
      reason: "调用方指定知识库",
      method: "configured",
    };
  }

  const all = await store.listKnowledgeBasesForRouting();
  const enabled = all.filter((b) => b.enabled);

  if (enabled.length === 0) {
    throw new Error("没有已启用的知识库");
  }

  // 最高优先级:调用方显式传 docType → 硬过滤
  const explicitDocType = options?.filter?.docType;
  if (explicitDocType) {
    const matched = enabled.filter((b) => b.docType === explicitDocType);
    if (matched.length > 0) {
      return {
        kbIds: matched.map((b) => b.id),
        labels: matched.map((b) => b.displayName || b.name),
        reason: `docType 硬过滤: ${explicitDocType}`,
        method: "docType",
      };
    }
    // 没匹配上时回退到 LLM,不报错
  }

  if (enabled.length === 1) {
    const b = enabled[0];
    return {
      kbIds: [b.id],
      labels: [b.displayName || b.name],
      reason: "仅有一个启用的知识库",
      method: "single",
    };
  }

  // 用户显式配置了默认库且关闭路由时
  if (rag.kbRoutingEnabled === false && cfg.activeKnowledgeBaseId) {
    const b = enabled.find((x) => x.id === cfg.activeKnowledgeBaseId) ?? enabled[0];
    return {
      kbIds: [b.id],
      labels: [b.displayName || b.name],
      reason: "使用配置中的默认知识库（已关闭智能路由）",
      method: "configured",
    };
  }

  const llm = options?.llm ?? getLLM();
  if (rag.kbRoutingEnabled !== false) {
    const cacheKey = buildRouteCacheKey(query, enabled);
    const cached = getRouteCache(cacheKey);
    if (cached) return cached;
    const routed = await llmRoute(query, enabled, llm, maxKb);
    if (routed && routed.kbIds.length > 0) {
      setRouteCache(cacheKey, routed);
      return routed;
    }
  }

  return heuristicRoute(query, enabled, maxKb);
}
