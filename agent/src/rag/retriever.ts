// RAG Retriever: vector similarity search + context assembly

import { cosineSimilarity, createEmbedder, type Embedder } from "./embedder";
import type { LLMProvider } from "../llm/client";

export interface RetrievedChunk {
  content: string;
  fileName: string;
  section?: string;
  similarity: number;
  chunkId: number;
  documentId: number;
}

export interface RetrieverOptions {
  topK: number;
  similarityThreshold: number;
  maxContextTokens: number;
}

export interface Retriever {
  /** Vector similarity search */
  search(query: string, embedding: number[], options?: Partial<RetrieverOptions>): Promise<RetrievedChunk[]>;
  /** Build a context string from chunks */
  buildContext(chunks: RetrievedChunk[], maxTokens?: number): string;
  /** Hybrid search: vector + keyword */
  hybridSearch(query: string, options?: Partial<RetrieverOptions>): Promise<RetrievedChunk[]>;
}

/**
 * Simple in-memory retriever for MVP.
 * In production, this queries pgvector directly via Prisma.
 *
 * @deprecated 实际生产检索已迁移至 server/src/services/prisma.store.ts 和 rag-search.service.ts。
 *             此函数仅为 MVP 阶段的参考实现，不再被任何代码路径使用。
 */
export function createInMemoryRetriever(): Retriever {
  const store: { chunk: RetrievedChunk; embedding: number[] }[] = [];

  return {
    async search(_query: string, queryEmbedding: number[], options?: Partial<RetrieverOptions>): Promise<RetrievedChunk[]> {
      const opts = { topK: 15, similarityThreshold: 0.5, maxContextTokens: 6000, ...options };

      const scored = store
        .map(item => ({ chunk: item.chunk, similarity: cosineSimilarity(queryEmbedding, item.embedding) }))
        .filter(s => s.similarity >= opts.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, opts.topK);

      return scored.map(s => s.chunk);
    },

    buildContext(chunks: RetrievedChunk[], maxTokens = 6000): string {
      const parts: string[] = [];
      let totalChars = 0;

      for (const chunk of chunks) {
        const header = `[来源: ${chunk.fileName}${chunk.section ? ` | ${chunk.section}` : ""} | 相关度: ${chunk.similarity.toFixed(2)}]`;
        const text = `${header}\n${chunk.content}\n---\n`;
        if (totalChars + text.length > maxTokens * 2) break;
        parts.push(text);
        totalChars += text.length;
      }

      return parts.join("\n");
    },

    // For MVP, hybrid search falls back to vector search with basic keyword scoring
    async hybridSearch(query: string, options?: Partial<RetrieverOptions>): Promise<RetrievedChunk[]> {
      const embedder = createEmbedder({} as LLMProvider);
      // Fallback: use keyword presence as a boost
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 1);
      const vectorResults = await this.search(query, [], options);

      return vectorResults.map(r => {
        const contentLower = r.content.toLowerCase();
        const keywordHits = keywords.filter(k => contentLower.includes(k)).length;
        const boost = keywords.length > 0 ? (keywordHits / keywords.length) * 0.1 : 0;
        return { ...r, similarity: Math.min(1, r.similarity + boost) };
      }).sort((a, b) => b.similarity - a.similarity);
    },
  };
}
