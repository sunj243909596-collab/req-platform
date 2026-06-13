// Knowledge base indexer orchestrator
// Coordinates scanning, parsing, chunking, embedding, and storage

import { scanDirectory, computeDelta, type ScannedFile } from "./scanner";
import { chunkDocument } from "../rag/chunker";
import { type Embedder } from "../rag/embedder";

export interface IndexerConfig {
  basePath: string;
  knowledgeBaseId: number;
}

export interface IndexProgress {
  totalFiles: number;
  processedFiles: number;
  totalChunks: number;
  status: "scanning" | "chunking" | "embedding" | "storing" | "completed" | "failed";
  error?: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;

/**
 * Full index pipeline for a knowledge base source.
 * Returns chunks ready for storage.
 */
export async function indexKnowledgeBase(
  config: IndexerConfig,
  embedder: Embedder,
  onProgress?: ProgressCallback
): Promise<{ file: ScannedFile; chunks: { index: number; content: string; metadata: Record<string, unknown> }[] }[]> {
  // Phase 1: Scan
  onProgress?.({ totalFiles: 0, processedFiles: 0, totalChunks: 0, status: "scanning" });
  const files = scanDirectory(config.basePath);

  // Phase 2: Parse + Chunk
  onProgress?.({ totalFiles: files.length, processedFiles: 0, totalChunks: 0, status: "chunking" });

  const fileChunks: Map<ScannedFile, ReturnType<typeof chunkDocument>> = new Map();
  let totalChunks = 0;
  let processedFiles = 0;

  for (const file of files) {
    if (file.status === "unchanged" || file.status === "deleted") {
      processedFiles++;
      continue;
    }

    try {
      // Dynamic import for fs in the parser context
      const fs = await import("fs");
      const content = fs.readFileSync(file.filePath, "utf-8");
      const chunks = chunkDocument(file.fileName, content);
      fileChunks.set(file, chunks);
      totalChunks += chunks.length;
    } catch (err) {
      console.error(`Failed to parse ${file.filePath}:`, err);
    }

    processedFiles++;
    onProgress?.({ totalFiles: files.length, processedFiles, totalChunks, status: "chunking" });
  }

  // Phase 3: Embed
  onProgress?.({ totalFiles: files.length, processedFiles, totalChunks, status: "embedding" });
  // Note: Actual embedding and storing is done by the caller (server-side)
  // to keep the agent package DB-agnostic

  const result: { file: ScannedFile; chunks: { index: number; content: string; metadata: Record<string, unknown> }[] }[] = [];

  for (const [file, chunks] of fileChunks) {
    result.push({
      file,
      chunks: chunks.map((c, i) => ({
        index: i,
        content: c.content,
        metadata: { ...c.metadata, fileName: file.fileName, filePath: file.relativePath },
      })),
    });
  }

  onProgress?.({ totalFiles: files.length, processedFiles, totalChunks, status: "completed" });
  return result;
}
