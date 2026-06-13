// Similar requirement detection via embedding similarity

import type { Embedder } from "../rag/embedder";
import { cosineSimilarity } from "../rag/embedder";

export interface SimilarReqResult {
  reqId: number;
  reqNo: string;
  title: string;
  priority: string;
  status: string;
  similarity: number;
}

/**
 * Find similar requirements by comparing the new requirement's embedding
 * against stored requirement embeddings.
 */
export async function findSimilarRequirements(
  embedder: Embedder,
  newReq: { title: string; description?: string },
  existingReqs: {
    id: number;
    reqNo: string;
    title: string;
    priority: string;
    status: string;
    embedding: number[] | null;
  }[],
  topK = 10
): Promise<SimilarReqResult[]> {
  const queryText = `${newReq.title}\n${newReq.description || ""}`;
  const queryEmbedding = await embedder.embedQuery(queryText);

  const scored = existingReqs
    .filter(r => r.embedding)
    .map(r => ({
      reqId: r.id,
      reqNo: r.reqNo,
      title: r.title,
      priority: r.priority,
      status: r.status,
      similarity: cosineSimilarity(queryEmbedding, r.embedding!),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return scored;
}
