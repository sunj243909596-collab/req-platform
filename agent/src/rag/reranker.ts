// Re-ranker for search results — deduplicates and ensures source diversity

import type { RetrievedChunk } from "./retriever";

/**
 * Simple re-ranker that:
 * 1. Deduplicates near-identical chunks
 * 2. Ensures diverse source coverage
 * 3. Returns top K results
 */
export function rerank(chunks: RetrievedChunk[], topK = 5): RetrievedChunk[] {
  if (chunks.length <= topK) return chunks;

  const deduped = deduplicate(chunks);
  const diverse = ensureDiversity(deduped, topK);

  return diverse.slice(0, topK);
}

function deduplicate(chunks: RetrievedChunk[], threshold = 0.85): RetrievedChunk[] {
  const kept: RetrievedChunk[] = [];

  for (const chunk of chunks) {
    let isDuplicate = false;
    for (const existing of kept) {
      const overlap = jaccardSimilarity(chunk.content.slice(0, 200), existing.content.slice(0, 200));
      if (overlap > threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) kept.push(chunk);
  }

  return kept;
}

function ensureDiversity(chunks: RetrievedChunk[], topK: number): RetrievedChunk[] {
  const bySource = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const source = chunk.fileName;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(chunk);
  }

  // Take best from each source, round-robin
  const result: RetrievedChunk[] = [];
  const sources = Array.from(bySource.keys());
  let idx = 0;

  while (result.length < topK && sources.length > 0) {
    const source = sources[idx % sources.length];
    const sourceChunks = bySource.get(source)!;
    if (sourceChunks.length > 0) {
      result.push(sourceChunks.shift()!);
    } else {
      sources.splice(idx % sources.length, 1);
      continue;
    }
    idx++;
  }

  return result.sort((a, b) => b.similarity - a.similarity);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
