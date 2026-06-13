// 统一 RAG 检索：知识库路由 → 混合检索 → 多路查询 → rerank
import {
  rerank,
  expandSearchQueries,
  mergeHybridChunks,
  mergeMultiQueryChunks,
  extractGroundedTableNames,
  type RetrievedChunk,
  type ScoredChunk,
} from "agent";
import { readConfig, type AgentConfigData } from "./agent-config.service";
import type { AgentDataStore } from "./agent.service";
import {
  routeKnowledgeBases,
  type KbRoutingResult,
  type KbRoutingStore,
} from "./kb-router.service";
import { llmRerankCandidates, type LlmRerankCandidate } from "./llm-rerank.service";
import {
  chunkToResult,
  filterChunksByThreshold,
  normalizeChunkSource,
  type RagSearchResult as ChunkRagResult,
} from "./rag-chunk.util";

export interface RagDocumentFilter {
  docType?: string;
  pathPrefix?: string;
}

export interface RagSearchOptions {
  /** 指定单个库时跳过 LLM 路由 */
  kbId?: number;
  topK?: number;
  docType?: string;
  pathPrefix?: string;
  extraQueries?: string[];
  /** 关闭本次智能选库（仍可用 kbId） */
  skipKbRouting?: boolean;
}

export type RagSearchResult = ChunkRagResult;

export type SmartSearchResponse = {
  chunks: RagSearchResult[];
  routing: KbRoutingResult;
  /** 最终重排方式 */
  rerankMethod?: "llm" | "heuristic";
};

/** 供对话 UI 展示的检索溯源信息 */
export type RagRetrievalMeta = {
  routing: KbRoutingResult;
  rerankMethod?: "llm" | "heuristic";
  /** 从片段中提取的可引用表名（wm_/WM_/app_/spl_） */
  groundedTableNames: string[];
  sources: {
    fileName: string;
    section?: string;
    similarity: number;
    preview: string;
    relativePath?: string;
  }[];
};

const RAG_PREVIEW_CHARS = 320;

export function buildRagRetrievalMeta(
  chunks: RagSearchResult[],
  routing: KbRoutingResult,
  rerankMethod?: "llm" | "heuristic"
): RagRetrievalMeta {
  return {
    routing,
    rerankMethod,
    groundedTableNames: extractGroundedTableNames(chunks),
    sources: chunks.map((c) => ({
      fileName: c.fileName,
      section: c.section,
      similarity: c.similarity,
      preview: c.content.replace(/\s+/g, " ").trim().slice(0, RAG_PREVIEW_CHARS),
      relativePath: c.relativePath,
    })),
  };
}

type StoreChunk = ScoredChunk & { chunkId?: number; documentId?: number };

export async function resolveKbId(
  store: AgentDataStore,
  explicit?: number
): Promise<number> {
  if (explicit != null && explicit > 0) return explicit;
  const cfg = readConfig();
  if (cfg.activeKnowledgeBaseId != null && cfg.activeKnowledgeBaseId > 0) {
    return cfg.activeKnowledgeBaseId;
  }
  return store.getDefaultKnowledgeBaseId();
}

export function resolveDocumentFilter(
  options: RagSearchOptions,
  cfg?: AgentConfigData
): RagDocumentFilter | undefined {
  const rag = (cfg ?? readConfig()).rag;
  const docType = (options.docType ?? rag.searchDocType ?? "").trim() || undefined;
  const pathPrefix = (options.pathPrefix ?? rag.searchPathPrefix ?? "").trim() || undefined;
  if (!docType && !pathPrefix) return undefined;
  return { docType, pathPrefix };
}

function resolveQueryList(query: string, options: RagSearchOptions, cfg: AgentConfigData): string[] {
  if (options.extraQueries?.length) {
    return [...new Set([query.trim(), ...options.extraQueries.map((q) => q.trim()).filter(Boolean)])];
  }
  if (cfg.rag.multiQueryEnabled !== false) {
    return expandSearchQueries(query, cfg.rag.multiQueryMax ?? 3);
  }
  return [query.trim()].filter(Boolean);
}

async function retrieveForQuery(
  query: string,
  store: AgentDataStore,
  embedQuery: (text: string) => Promise<number[] | null>,
  kbId: number,
  candidateK: number,
  filter: RagDocumentFilter | undefined,
  cfg: AgentConfigData
): Promise<StoreChunk[]> {
  const rag = cfg.rag;
  const hybrid = rag.hybridSearchEnabled !== false;
  let vector: StoreChunk[] = [];
  let keyword: StoreChunk[] = [];

  try {
    const embedding = await embedQuery(query);
    if (embedding?.length) {
      vector = (await store.searchByVector(embedding, candidateK, kbId, filter)).map(
        (c) => ({ ...c, retrievalSource: "vector" as const })
      );
    }
  } catch (vecErr) {
    console.warn(`[rag] Vector search failed, falling back to keyword-only: ${(vecErr as Error).message}`);
  }

  keyword = (await store.searchKnowledgeBase(query, candidateK, kbId, filter)).map(
    (c) => ({ ...c, retrievalSource: "keyword" as const })
  );

  if (hybrid && vector.length > 0 && keyword.length > 0) {
    return mergeHybridChunks(
      vector,
      keyword,
      rag.hybridVectorWeight ?? 0.7,
      rag.hybridKeywordWeight ?? 0.3
    );
  }
  if (vector.length > 0) return vector;
  return keyword;
}

async function searchInKnowledgeBase(
  query: string,
  store: AgentDataStore,
  embedQuery: (text: string) => Promise<number[] | null>,
  kbId: number,
  options: RagSearchOptions,
  cfg: AgentConfigData
): Promise<StoreChunk[]> {
  const rag = cfg.rag;
  const topK = options.topK ?? rag.topK;
  const threshold = rag.similarityThreshold ?? 0.58;
  const candidateK = Math.max(topK * (rag.vectorCandidateMultiplier ?? 3), topK);
  const filter = resolveDocumentFilter(options, cfg);
  const queries = resolveQueryList(query, options, cfg);
  const perQuery: StoreChunk[][] = [];

  for (const q of queries) {
    const hits = await retrieveForQuery(q, store, embedQuery, kbId, candidateK, filter, cfg);
    if (hits.length > 0) perQuery.push(hits);
  }

  const merged = perQuery.length > 1 ? mergeMultiQueryChunks(perQuery) : (perQuery[0] ?? []);
  const processed = postProcessSearchResults(merged, topK, threshold, false, true);
  if (processed.length > 0) {
    return processed as StoreChunk[];
  }

  const fallback = (await store.searchKnowledgeBase(query, candidateK, kbId, filter)).map(
    (c) => ({ ...c, retrievalSource: "keyword" as const })
  );
  return postProcessSearchResults(fallback, topK, 0, false, true) as StoreChunk[];
}

function toRetrieved(chunks: StoreChunk[]): RetrievedChunk[] {
  return chunks.map((c, i) => ({
    content: c.content,
    fileName: c.fileName,
    section: c.section,
    similarity: c.similarity,
    chunkId: c.chunkId ?? -(i + 1),
    documentId: c.documentId ?? 0,
  }));
}

function enrichReranked(
  reranked: RetrievedChunk[],
  sourceByChunkId: Map<number, StoreChunk>
): StoreChunk[] {
  return reranked.map((r) => {
    const src = r.chunkId > 0 ? sourceByChunkId.get(r.chunkId) : undefined;
    return {
      content: r.content,
      fileName: r.fileName,
      section: r.section,
      similarity: r.similarity,
      chunkId: r.chunkId > 0 ? r.chunkId : src?.chunkId,
      documentId: r.documentId > 0 ? r.documentId : src?.documentId,
      relativePath: src?.relativePath,
      docType: src?.docType,
      retrievalSource: src?.retrievalSource,
    };
  });
}

export function postProcessSearchResults(
  chunks: StoreChunk[],
  topK: number,
  similarityThreshold: number,
  _vectorMode: boolean,
  asStoreChunks = false
): RagSearchResult[] | StoreChunk[] {
  if (chunks.length === 0) return [];

  const filtered = filterChunksByThreshold(chunks, similarityThreshold, _vectorMode);
  if (filtered.length === 0) return [];

  const sourceByChunkId = new Map<number, StoreChunk>();
  for (const c of filtered) {
    if (c.chunkId != null && c.chunkId > 0) sourceByChunkId.set(c.chunkId, c);
  }

  const reranked = rerank(toRetrieved(filtered), topK);
  const enriched = enrichReranked(reranked, sourceByChunkId);
  if (asStoreChunks) return enriched;
  return enriched.map(chunkToResult);
}

function storeChunksToCandidates(chunks: StoreChunk[]): LlmRerankCandidate[] {
  return chunks.map((c, i) => ({
    chunkId: c.chunkId ?? -(i + 1),
    documentId: c.documentId ?? 0,
    fileName: c.fileName,
    section: c.section,
    content: c.content,
    similarity: c.similarity,
  }));
}

/** 阈值过滤 + LLM/启发式重排 */
export async function finalizeSearchResults(
  query: string,
  chunks: StoreChunk[],
  topK: number,
  _vectorMode: boolean,
  threshold: number
): Promise<{ results: RagSearchResult[]; rerankMethod: "llm" | "heuristic" }> {
  if (chunks.length === 0) {
    return { results: [], rerankMethod: "heuristic" };
  }

  const normalized = chunks.map(normalizeChunkSource);
  const filtered = filterChunksByThreshold(normalized, threshold);
  if (filtered.length === 0) {
    return { results: [], rerankMethod: "heuristic" };
  }

  const byId = new Map(filtered.map((c) => [c.chunkId ?? 0, c]));
  const { chunks: reranked, method } = await llmRerankCandidates(
    query,
    storeChunksToCandidates(filtered),
    topK
  );

  return {
    results: reranked.map((r) => {
      const full = byId.get(r.chunkId);
      return chunkToResult(
        full
          ? { ...full, content: r.content, fileName: r.fileName, section: r.section, similarity: r.similarity }
          : { ...r, chunkId: r.chunkId, documentId: r.documentId }
      );
    }),
    rerankMethod: method,
  };
}

/** 智能检索（含知识库路由），返回分块 + 路由说明 */
export async function smartSearch(
  query: string,
  store: AgentDataStore,
  embedQuery: (text: string) => Promise<number[] | null>,
  options: RagSearchOptions = {}
): Promise<SmartSearchResponse> {
  const _t0 = Date.now();
  const cfg = readConfig();
  const rag = cfg.rag;
  const topK = options.topK ?? rag.topK;

  let routing: KbRoutingResult;

  if (options.kbId && options.skipKbRouting) {
    const bases = await (store as KbRoutingStore).listKnowledgeBasesForRouting();
    const b = bases.find((x) => x.id === options.kbId);
    routing = {
      kbIds: [options.kbId],
      labels: [b?.displayName || b?.name || `KB#${options.kbId}`],
      reason: "API 指定知识库",
      method: "configured",
    };
  } else if (options.kbId) {
    routing = await routeKnowledgeBases(query, store as KbRoutingStore, {
      explicitKbId: options.kbId,
      filter: options.docType ? { docType: options.docType } : undefined,
    });
  } else if (options.skipKbRouting || rag.kbRoutingEnabled === false) {
    const kbId = await resolveKbId(store, undefined);
    const bases = await (store as KbRoutingStore).listKnowledgeBasesForRouting();
    const b = bases.find((x) => x.id === kbId);
    routing = {
      kbIds: [kbId],
      labels: [b?.displayName || b?.name || `KB#${kbId}`],
      reason: "使用默认知识库",
      method: "default",
    };
  } else {
    const docTypeFilter =
      options.docType ?? (rag.ragDocTypeStrict && rag.searchDocType ? rag.searchDocType : undefined);
    routing = await routeKnowledgeBases(query, store as KbRoutingStore, {
      filter: docTypeFilter ? { docType: docTypeFilter } : undefined,
    });
  }

  const perKb: StoreChunk[][] = [];
  for (const kbId of routing.kbIds) {
    const hits = await searchInKnowledgeBase(query, store, embedQuery, kbId, options, cfg);
    if (hits.length > 0) perKb.push(hits);
  }

  let merged: StoreChunk[] =
    perKb.length > 1 ? mergeMultiQueryChunks(perKb) : (perKb[0] ?? []);

  if (merged.length === 0 && routing.kbIds.length > 0) {
    const kbId = routing.kbIds[0];
    const candidateK = Math.max(topK * (rag.vectorCandidateMultiplier ?? 3), topK);
    const filter = resolveDocumentFilter(options, cfg);
    const fallback = await store.searchKnowledgeBase(query, candidateK, kbId, filter);
    merged = postProcessSearchResults(fallback, topK, 0, false, true) as StoreChunk[];
  }

  const threshold = rag.similarityThreshold ?? 0.58;
  const { results: chunks, rerankMethod } = await finalizeSearchResults(
    query,
    merged,
    topK,
    false,
    threshold
  );

  console.log(
    JSON.stringify({
      event: "rag_search",
      queryLen: query.length,
      kbIds: routing.kbIds,
      routingMethod: routing.method,
      resultCount: chunks.length,
      rerankMethod,
      durationMs: Date.now() - _t0,
    })
  );

  return { chunks, routing, rerankMethod };
}

/** 兼容旧调用：仅返回分块数组 */
export async function smartSearchChunks(
  query: string,
  store: AgentDataStore,
  embedQuery: (text: string) => Promise<number[] | null>,
  options: RagSearchOptions = {}
): Promise<RagSearchResult[]> {
  const { chunks } = await smartSearch(query, store, embedQuery, options);
  return chunks;
}
