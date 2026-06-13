// Embedding generation using OpenAI text-embedding-3-small
// Falls back to a simple keyword-based approach when API key is not configured

import type { LLMProvider } from "../llm/client";

export interface Embedder {
  embedTexts(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

export function createEmbedder(llm: LLMProvider): Embedder {
  return {
    async embedTexts(texts: string[]): Promise<number[][]> {
      // Process in batches of 20
      const batchSize = 20;
      const allEmbeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const result = await llm.embed(batch);
        allEmbeddings.push(...result.embeddings);
      }

      return allEmbeddings;
    },

    async embedQuery(query: string): Promise<number[]> {
      const result = await llm.embed([query]);
      return result.embeddings[0];
    },
  };
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
