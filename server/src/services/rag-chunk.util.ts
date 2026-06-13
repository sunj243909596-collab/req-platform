// RAG 分块元数据与阈值过滤工具

export type RetrievalSource = "vector" | "keyword" | "hybrid";

export type ScoredChunk = {
  content: string;
  fileName: string;
  section?: string;
  similarity: number;
  chunkId?: number;
  documentId?: number;
  relativePath?: string;
  docType?: string;
  retrievalSource?: RetrievalSource;
  /** 兼容测试与旧字段 */
  source?: RetrievalSource | string;
};

export function normalizeChunkSource(c: ScoredChunk): ScoredChunk {
  const src =
    c.retrievalSource ??
    (c.source === "vector" || c.source === "keyword" || c.source === "hybrid"
      ? c.source
      : undefined);
  if (!src || src === c.retrievalSource) return c;
  return { ...c, retrievalSource: src };
}

export type RagSearchResult = {
  content: string;
  fileName: string;
  section?: string;
  similarity: number;
  chunkId?: number;
  documentId?: number;
  relativePath?: string;
  docType?: string;
  retrievalSource?: RetrievalSource;
};

export function chunkToResult(chunk: ScoredChunk): RagSearchResult {
  return {
    content: chunk.content,
    fileName: chunk.fileName,
    section: chunk.section,
    similarity: chunk.similarity,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    relativePath: chunk.relativePath,
    docType: chunk.docType,
    retrievalSource: chunk.retrievalSource,
  };
}

/** 向量阈值只约束纯向量命中；关键词/混合命中不因向量阈值被误删 */
export function filterChunksByThreshold(
  chunks: ScoredChunk[],
  threshold: number,
  strictVectorOnly = false
): ScoredChunk[] {
  if (chunks.length === 0) return [];
  const normalized = chunks.map(normalizeChunkSource);
  const hasSourceTags = normalized.some((c) => c.retrievalSource);
  if (!hasSourceTags && strictVectorOnly) {
    return normalized.filter((c) => c.similarity >= threshold);
  }
  return normalized.filter((c) => {
    if (c.retrievalSource === "keyword" || c.retrievalSource === "hybrid") {
      return true;
    }
    if (c.retrievalSource === "vector") {
      return c.similarity >= threshold;
    }
    // 未打标且非 strict：低分保留作关键词兜底
    if (c.similarity < threshold) return true;
    return c.similarity >= threshold;
  });
}
