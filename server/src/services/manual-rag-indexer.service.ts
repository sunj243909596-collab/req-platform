// Manual → RAG Knowledge Base indexer
// Indexes operation manuals (articles + documents) into a dedicated KB
// so the AI assistant can search and reference SOPs, manuals, etc.

import { prisma } from "../lib/prisma";
import { chunkDocument } from "agent";
import { getEmbedder } from "./embedder.service";
import { readConfig } from "./agent-config.service";
import { readDocumentText } from "./document-text.service";
import fs from "fs";
import crypto from "crypto";
import path from "path";


const MANUAL_KB_NAME = "操作手册";
const MANUAL_KB_DISPLAY_NAME = "操作手册 (SOP/操作指南/FAQ)";

/**
 * Get or create the "操作手册" KnowledgeBase.
 */
export async function getOrCreateManualKb(): Promise<number> {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { name: MANUAL_KB_NAME },
  });

  if (kb) return kb.id;

  const basePath = path.posix.join("uploads", "kb", "manuals");
  kb = await prisma.knowledgeBase.create({
    data: {
      name: MANUAL_KB_NAME,
      displayName: MANUAL_KB_DISPLAY_NAME,
      description: "操作手册知识库，包含 SOP、操作指南、FAQ 等运维文档，AI 问答时可检索",
      basePath,
      sourceType: "upload",
      docType: "MANUAL",
      enabled: true,
      routingExamples: [
        { query: "入库怎么操作", label: "操作流程" },
        { query: "ASN 收货步骤", label: "收货流程" },
        { query: "出库流程是什么", label: "出库指南" },
        { query: "常见问题", label: "FAQ" },
        { query: "系统操作说明", label: "SOP" },
      ],
    },
  });

  const dir = path.resolve(process.cwd(), basePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return kb.id;
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Index a single operation manual article into the RAG KB.
 * Called after creating/updating an article.
 */
export async function indexManualInRAG(
  manualId: number
): Promise<{ chunks: number } | null> {
  try {
    const manual = await prisma.operationManual.findUnique({
      where: { id: manualId },
    });
    if (!manual) return null;

    // Only index article type (markdown content) and document type with .md/.txt files
    if (manual.type === "link") return null; // Links can't be embedded

    let content: string;
    let fileName: string;

    if (manual.type === "article") {
      if (!manual.content?.trim()) return null;
      content = manual.content;
      fileName = manual.title;
    } else if (manual.type === "document" && manual.filePath) {
      const ext = path.extname(manual.fileName || "").toLowerCase();
      if (![".md", ".txt"].includes(ext)) {
        // For non-text files, try to extract text
        const fullPath = path.join(process.cwd(), manual.filePath);
        if (!fs.existsSync(fullPath)) return null;
        try {
          content = await readDocumentText(fullPath, manual.fileName || manual.title);
        } catch {
          return null; // Can't extract text, skip
        }
      } else {
        const fullPath = path.join(process.cwd(), manual.filePath);
        if (!fs.existsSync(fullPath)) return null;
        content = fs.readFileSync(fullPath, "utf-8");
      }
      fileName = manual.fileName || manual.title;
    } else {
      return null;
    }

    if (!content.trim()) return null;

    const fileHash = hashContent(content);
    const kbId = await getOrCreateManualKb();

    // Relative path format: manual:{id}:{title}
    const relativePath = `manual:${manualId}:${manual.title}`;

    // Check if already indexed
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath },
      select: { id: true, fileHash: true },
    });

    if (existing && existing.fileHash === fileHash) {
      return null; // No change
    }

    // Chunk
    const rag = readConfig().rag;
    const maxChars = rag.chunkMaxCharsMd ?? 3000;
    const overlap = rag.chunkOverlapMd ?? 200;
    const chunks = chunkDocument(fileName, content, maxChars, overlap);
    if (chunks.length === 0) return null;

    // Embed（外部 API 调用，不放在事务内以避免长持锁）
    const texts = chunks.map((c) => c.content);
    let embeddings: number[][] = [];
    try {
      embeddings = await getEmbedder().embedTexts(texts);
    } catch {
      // text-only mode
    }

    const expectedDim = readConfig().embeddingDimension ?? 1536;

    // 事务：upsert 文档记录 + 批量写 chunk，失败整体回滚
    await prisma.$transaction(
      async (tx) => {
        let docId: number;
        if (existing) {
          await tx.knowledgeChunk.deleteMany({ where: { documentId: existing.id } });
          await tx.knowledgeDocument.update({
            where: { id: existing.id },
            data: { fileSize: content.length, fileHash, chunkCount: chunks.length, indexedAt: new Date() },
          });
          docId = existing.id;
        } else {
          const newDoc = await tx.knowledgeDocument.create({
            data: {
              knowledgeBaseId: kbId,
              fileName,
              filePath: `manual://${manualId}`,
              relativePath,
              fileSize: content.length,
              fileHash,
              mimeType: "text/markdown",
              docType: manual.category || "MANUAL",
              chunkCount: chunks.length,
              indexedAt: new Date(),
            },
          });
          docId = newDoc.id;
        }

        for (let i = 0; i < chunks.length; i++) {
          const emb = embeddings[i];
          const validEmb = emb && emb.length === expectedDim && emb.every(Number.isFinite);
          const vectorExpr = validEmb ? `'[${emb.join(",")}]'::vector` : "NULL";
          await tx.$executeRawUnsafe(
            `INSERT INTO "KnowledgeChunk" (document_id, chunk_index, content, content_tokens, embedding, metadata)
             VALUES ($1, $2, $3, $4, ${vectorExpr}, $5::jsonb)`,
            docId,
            i,
            chunks[i].content,
            Math.ceil(chunks[i].content.length / 3),
            JSON.stringify({
              ...chunks[i].metadata,
              manualId: manual.id,
              manualTitle: manual.title,
              category: manual.category,
              tags: manual.tags,
            })
          );
        }
      },
      { timeout: 60000 }
    );

    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { lastSyncedAt: new Date() },
    });

    return { chunks: chunks.length };
  } catch (err) {
    console.error(`[manual-rag] Failed to index manual ${manualId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Remove an operation manual from the RAG KB.
 * Called when a manual is deleted.
 */
export async function removeManualFromRAG(
  manualId: number
): Promise<void> {
  try {
    const kbId = await getOrCreateManualKb();
    const relativePath = `manual:${manualId}:`;

    // Find by prefix (we store the title after the second colon)
    const kbDocs = await prisma.knowledgeDocument.findMany({
      where: {
        knowledgeBaseId: kbId,
        relativePath: { startsWith: relativePath },
      },
    });

    for (const doc of kbDocs) {
      await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });
      await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
    }

    if (kbDocs.length > 0) {
      console.log(`[manual-rag] Removed manual ${manualId} from KB ${kbId} (${kbDocs.length} documents)`);
    }
  } catch (err) {
    console.error(`[manual-rag] Failed to remove manual ${manualId}:`, (err as Error).message);
  }
}

/**
 * Re-index all operation manuals into the RAG KB.
 * Useful for one-time repair or after enabling the feature.
 */
export async function reindexAllManuals(): Promise<{ indexed: number; skipped: number; failed: number }> {
  const manuals = await prisma.operationManual.findMany({
    where: { type: { not: "link" } },
  });

  let indexed = 0;
  let skipped = 0;
  let failed = 0;

  for (const manual of manuals) {
    const result = await indexManualInRAG(manual.id);
    if (result) indexed++;
    else skipped++;
  }

  console.log(`[manual-rag] Reindex: indexed=${indexed}, skipped=${skipped}, failed=${failed}`);
  return { indexed, skipped, failed };
}
