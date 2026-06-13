// Chunk KB indexer — indexes chunked content (e.g. from bar-gun/PDA scanning data) into a separate KB.
// This KB stores individual chunk records (like LPN/ASN details) for fine-grained RAG retrieval.

import { prisma } from "../lib/prisma";
import { getEmbedder } from "./embedder.service";
import { readConfig } from "./agent-config.service";
import crypto from "crypto";


const CHUNK_KB_NAME = "巴枪端分块";
const CHUNK_KB_DISPLAY_NAME = "巴枪端分块知识库";

/**
 * Get or create the "巴枪端分块" KnowledgeBase.
 */
export async function getOrCreateChunkKb(): Promise<number> {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { name: CHUNK_KB_NAME },
  });

  if (kb) return kb.id;

  kb = await prisma.knowledgeBase.create({
    data: {
      name: CHUNK_KB_NAME,
      displayName: CHUNK_KB_DISPLAY_NAME,
      description: "巴枪端扫描/操作的分块数据记录，用于细粒度 RAG 检索",
      basePath: "uploads/kb/chunk-data",
      sourceType: "upload",
      docType: "CHUNK_DATA",
      enabled: true,
      routingExamples: [
        { query: "LPN 扫码记录", label: "货箱扫描" },
        { query: "ASN 收货明细", label: "收货记录" },
        { query: "序列号追溯", label: "序列号" },
      ],
    },
  });

  return kb.id;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Index a batch of chunk records into the RAG KB.
 *
 * @param chunks Array of { content, metadata } to index
 * @param sourceTag A tag to identify the source of these chunks (e.g. "LPN_SCAN", "ASN_RECEIPT")
 * @returns Number of chunks indexed
 */
export async function indexChunks(
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>,
  sourceTag: string
): Promise<number> {
  if (chunks.length === 0) return 0;

  const kbId = await getOrCreateChunkKb();

  // Create a virtual document for this batch
  const batchKey = `${sourceTag}_${new Date().toISOString().slice(0, 10)}`;
  const combinedContent = chunks.map((c, i) => `## Chunk ${i}\n${c.content}`).join("\n\n");
  const fileHash = hashContent(combinedContent);

  const relativePath = `batch:${batchKey}`;

  // Check if already indexed
  const existing = await prisma.knowledgeDocument.findFirst({
    where: { knowledgeBaseId: kbId, relativePath },
    select: { id: true, fileHash: true },
  });

  if (existing && existing.fileHash === fileHash) {
    return 0; // No change
  }

  // Delete old chunks if re-indexing
  if (existing) {
    await prisma.knowledgeChunk.deleteMany({ where: { documentId: existing.id } });
    await prisma.knowledgeDocument.delete({ where: { id: existing.id } });
  }

  // Embed（外部 API 调用，不放在事务内）
  const texts = chunks.map((c) => c.content);
  let embeddings: number[][] = [];
  try {
    embeddings = await getEmbedder().embedTexts(texts);
  } catch {
    // text-only mode
  }

  const expectedDim = readConfig().embeddingDimension ?? 1536;

  // 事务：创建文档记录 + 批量写 chunk，失败整体回滚
  await prisma.$transaction(
    async (tx) => {
      const doc = await tx.knowledgeDocument.create({
        data: {
          knowledgeBaseId: kbId,
          fileName: `${batchKey}.txt`,
          filePath: `virtual://${batchKey}`,
          relativePath,
          fileSize: combinedContent.length,
          fileHash,
          mimeType: "text/plain",
          docType: sourceTag,
          chunkCount: chunks.length,
          indexedAt: new Date(),
        },
      });

      for (let i = 0; i < chunks.length; i++) {
        const emb = embeddings[i];
        const validEmb = emb && emb.length === expectedDim && emb.every(Number.isFinite);
        const vectorExpr = validEmb ? `'[${emb.join(",")}]'::vector` : "NULL";
        await tx.$executeRawUnsafe(
          `INSERT INTO "KnowledgeChunk" (document_id, chunk_index, content, content_tokens, embedding, metadata)
           VALUES ($1, $2, $3, $4, ${vectorExpr}, $5::jsonb)`,
          doc.id,
          i,
          chunks[i].content,
          Math.ceil(chunks[i].content.length / 3),
          JSON.stringify({ source: sourceTag, ...chunks[i].metadata })
        );
      }
    },
    { timeout: 60000 }
  );

  await prisma.knowledgeBase.update({
    where: { id: kbId },
    data: { lastSyncedAt: new Date() },
  });

  return chunks.length;
}
