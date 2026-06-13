// LLM 语义重排：对召回候选按问题相关性排序（失败则回退启发式 rerank）
import { rerank, type RetrievedChunk } from "agent";
import { readConfig } from "./agent-config.service";
import { getLLM } from "./llm.service";

export interface LlmRerankCandidate {
  chunkId: number;
  documentId: number;
  fileName: string;
  section?: string;
  content: string;
  similarity: number;
}

/** 解析 LLM 返回的 rankedIds */
export function parseRankedIds(
  text: string,
  validIds: number[],
  maxLen: number
): number[] {
  const valid = new Set(validIds);
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]) as { rankedIds?: number[]; ids?: number[] };
    const raw = parsed.rankedIds ?? parsed.ids ?? [];
    const out: number[] = [];
    for (const id of raw) {
      if (typeof id === "number" && valid.has(id) && !out.includes(id)) {
        out.push(id);
        if (out.length >= maxLen) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

function toRetrieved(c: LlmRerankCandidate): RetrievedChunk {
  return {
    content: c.content,
    fileName: c.fileName,
    section: c.section,
    similarity: c.similarity,
    chunkId: c.chunkId,
    documentId: c.documentId,
  };
}

function heuristicRerank(candidates: LlmRerankCandidate[], topK: number): LlmRerankCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const reranked = rerank(
    sorted.map(toRetrieved),
    topK
  );
  const byId = new Map(candidates.map((c) => [c.chunkId, c]));
  return reranked
    .map((r) => byId.get(r.chunkId))
    .filter((c): c is LlmRerankCandidate => !!c);
}

/**
 * 对候选分块做 LLM 语义重排；未开启或失败时使用 agent rerank（去重+多样性）
 */
export async function llmRerankCandidates(
  query: string,
  candidates: LlmRerankCandidate[],
  topK: number
): Promise<{ chunks: LlmRerankCandidate[]; method: "llm" | "heuristic" }> {
  if (candidates.length === 0) {
    return { chunks: [], method: "heuristic" };
  }
  if (candidates.length <= topK) {
    return { chunks: candidates.slice(0, topK), method: "heuristic" };
  }

  const rag = readConfig().rag;
  if (rag.llmRerankEnabled === false) {
    return { chunks: heuristicRerank(candidates, topK), method: "heuristic" };
  }

  const candidateK = rag.llmRerankCandidateK ?? 20;
  const pool = [...candidates]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.min(candidates.length, candidateK));

  // Skip LLM when scores are already well-differentiated: top candidate clearly wins
  // (≥0.85) or score spread across the pool is large enough (≥0.18).
  const topScore = pool[0]?.similarity ?? 0;
  const spread = topScore - (pool[pool.length - 1]?.similarity ?? 0);
  if (topScore >= 0.85 || spread >= 0.18) {
    return { chunks: heuristicRerank(candidates, topK), method: "heuristic" };
  }

  const previewChars = rag.llmRerankPreviewChars ?? 450;
  const catalog = pool
    .map((c) => {
      const head = c.content.slice(0, previewChars).replace(/\s+/g, " ").trim();
      return `[id=${c.chunkId}] ${c.fileName}${c.section ? ` § ${c.section}` : ""} (score=${c.similarity.toFixed(2)})\n${head}`;
    })
    .join("\n---\n");

  const prompt = `你是 WMOS 仓储知识库检索重排助手。

【用户问题】
${query}

【候选片段】共 ${pool.length} 条，方括号内 id 为 chunkId：
${catalog}

请按与问题的**语义相关度**从高到低选出最相关的 ${topK} 条（可来自不同文件，避免重复段落）。
只输出 JSON，不要其它文字：
{"rankedIds":[chunkId 数字数组，长度≤${topK}]}`;

  try {
    const llm = getLLM();
    const res = await llm.chat({
      systemPrompt: "你只输出合法 JSON。",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 512,
    });

    const rankedIds = parseRankedIds(
      res.content,
      pool.map((c) => c.chunkId),
      topK
    );

    if (rankedIds.length > 0) {
      const byId = new Map(pool.map((c) => [c.chunkId, c]));
      const ordered: LlmRerankCandidate[] = [];
      for (const id of rankedIds) {
        const c = byId.get(id);
        if (c) ordered.push(c);
      }
      for (const c of pool) {
        if (ordered.length >= topK) break;
        if (!ordered.some((x) => x.chunkId === c.chunkId)) ordered.push(c);
      }
      return { chunks: ordered.slice(0, topK), method: "llm" };
    }
  } catch {
    // LLM 不可用 → 启发式
  }

  return { chunks: heuristicRerank(candidates, topK), method: "heuristic" };
}
