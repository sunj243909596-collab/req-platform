/** 向量 + 关键词混合打分 */

export type RetrievalSource = "vector" | "keyword" | "hybrid";

export interface ScoredChunk {
  content: string;
  fileName: string;
  section?: string;
  similarity: number;
  chunkId?: number;
  documentId?: number;
  relativePath?: string;
  docType?: string;
  retrievalSource?: RetrievalSource;
}

function chunkKey(c: ScoredChunk): string {
  if (c.chunkId != null && c.chunkId > 0) return `id:${c.chunkId}`;
  return `txt:${c.fileName}:${c.content.slice(0, 120)}`;
}

/**
 * 合并向量与关键词结果（加权求和，按 chunk 去重）
 */
export function mergeHybridChunks(
  vector: ScoredChunk[],
  keyword: ScoredChunk[],
  vectorWeight = 0.7,
  keywordWeight = 0.3
): ScoredChunk[] {
  const map = new Map<string, ScoredChunk>();

  for (const c of vector) {
    map.set(chunkKey(c), {
      ...c,
      similarity: c.similarity * vectorWeight,
      retrievalSource: "vector",
    });
  }

  for (const c of keyword) {
    const key = chunkKey(c);
    const kwScore = Math.min(1, (c.similarity || 0.3) * (keywordWeight / 0.3));
    const prev = map.get(key);
    if (prev) {
      prev.similarity = Math.min(1, prev.similarity + kwScore);
      prev.retrievalSource = "hybrid";
    } else {
      map.set(key, { ...c, similarity: kwScore, retrievalSource: "keyword" });
    }
  }

  return [...map.values()].sort((a, b) => b.similarity - a.similarity);
}

/** 多路查询结果合并（同一 chunk 取最高分） */
export function mergeMultiQueryChunks(lists: ScoredChunk[][]): ScoredChunk[] {
  const map = new Map<string, ScoredChunk>();
  for (const list of lists) {
    for (const c of list) {
      const key = chunkKey(c);
      const prev = map.get(key);
      if (!prev || c.similarity > prev.similarity) {
        map.set(key, {
          ...c,
          retrievalSource: c.retrievalSource ?? prev?.retrievalSource,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.similarity - a.similarity);
}
