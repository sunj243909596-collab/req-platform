// Document → RAG Knowledge Base indexer
// When a user uploads a MD/HTML document to a requirement, this service
// indexes it into the "产品需求文档" KnowledgeBase for RAG retrieval.

import { prisma } from "../lib/prisma";
import { chunkDocument } from "agent";
import { readDocumentText } from "./document-text.service";
import { getEmbedder } from "./embedder.service";
import { readConfig } from "./agent-config.service";
import fs from "fs";
import crypto from "crypto";
import path from "path";


/** The dedicated KB name for requirement documents */
const PRODUCT_DOC_KB_NAME = "产品需求文档";
const PRODUCT_DOC_KB_DISPLAY_NAME = "产品需求文档 (PRD/BRD/FSD)";

const CHUNK_KB_NAME = "巴枪端分块";
const CHUNK_KB_DISPLAY_NAME = "巴枪端分块知识库";

/**
 * Get or create the "产品需求文档" KnowledgeBase.
 * Returns the KB id.
 */
export async function getOrCreateProductDocKb(): Promise<number> {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { name: PRODUCT_DOC_KB_NAME },
  });

  if (kb) return kb.id;

  // Create it
  const basePath = path.posix.join("uploads", "kb", "product-docs");
  kb = await prisma.knowledgeBase.create({
    data: {
      name: PRODUCT_DOC_KB_NAME,
      displayName: PRODUCT_DOC_KB_DISPLAY_NAME,
      description: "需求管理平台上传的产品文档（PRD、BRD、FSD、数据模型设计等），自动索引到 RAG 知识库供智能检索",
      basePath,
      sourceType: "upload",
      docType: "PRODUCT_DOC",
      enabled: true,
      routingExamples: [
        { query: "入库业务流程是什么", label: "入库需求" },
        { query: "出库波次怎么设计", label: "出库需求" },
        { query: "GSP 冷链温度记录", label: "冷链需求" },
        { query: "ASN 收货流程", label: "收货需求" },
      ],
    },
  });

  // Also create base directory on disk
  const dir = path.resolve(process.cwd(), basePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return kb.id;
}

/**
 * Compute SHA256 hash of a string.
 */
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Index a single uploaded document into the RAG knowledge base.
 *
 * Called after a document is uploaded via the collaboration routes.
 * Reads the file from disk, chunks it, embeds it, and stores in KB.
 *
 * @param documentId The Document record id from collaboration.routes
 * @returns { chunks: number } number of indexed chunks, or null if failed
 */
export async function indexDocumentInRAG(
  documentId: number
): Promise<{ chunks: number } | null> {
  try {
    // 1. Read the Document record
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) {
      console.warn(`[doc-rag] Document ${documentId} not found`);
      return null;
    }
    if (!doc.docPath || doc.docPath.startsWith("http")) {
      console.warn(`[doc-rag] Document ${documentId} has no local file path`);
      return null;
    }

    // 2. Read file content
    const fullPath = path.join(process.cwd(), doc.docPath);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[doc-rag] File not found: ${fullPath}`);
      return null;
    }

    const ext = path.extname(doc.docPath).toLowerCase();
    const content = fs.readFileSync(fullPath, "utf-8");
    if (!content.trim()) {
      console.warn(`[doc-rag] Document ${documentId} is empty`);
      return null;
    }

    const fileHash = hashContent(content);

    // 3. Get or create KB
    const kbId = await getOrCreateProductDocKb();

    // 4. Copy file to KB basePath so sync can find it (relativePath = filename on disk)
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
    const kbDir = kb?.basePath ? path.resolve(process.cwd(), kb.basePath) : null;
    const diskFileName = `${doc.reqId}_${doc.docType}_${doc.docName}${ext}`.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
    const relativePath = diskFileName; // relative to KB basePath — must match scanDirectory output
    if (kbDir) {
      if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });
      const destPath = path.join(kbDir, diskFileName);
      fs.copyFileSync(fullPath, destPath);
    }

    // 5. Check if already indexed (same hash = no change) — match by disk filename
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath },
      select: { id: true, fileHash: true },
    });

    if (existing && existing.fileHash === fileHash) {
      console.log(`[doc-rag] Document ${documentId} already indexed, hash unchanged`);
      return null;
    }

    // 6. Chunk
    const rag = readConfig().rag;
    const maxChars = ext === ".md"
      ? (rag.chunkMaxCharsMd ?? 3000)
      : (rag.chunkMaxCharsText ?? 2000);
    const overlap = rag.chunkOverlapMd ?? 200;

    const chunks = chunkDocument(doc.docName, content, maxChars, overlap);
    if (chunks.length === 0) {
      console.warn(`[doc-rag] No chunks produced for document ${documentId}`);
      return null;
    }

    // 7. Embed（外部 API 调用，不放在事务内）
    const texts = chunks.map((c) => c.content);
    let embeddings: number[][] = [];
    try {
      embeddings = await getEmbedder().embedTexts(texts);
    } catch (embedErr) {
      console.warn(
        `[doc-rag] Embedding failed for doc ${documentId}: ${(embedErr as Error).message}. Falling back to text-only.`
      );
    }

    const expectedDim = readConfig().embeddingDimension ?? 1536;

    // 8. 事务：upsert 文档记录 + 批量写 chunk，失败整体回滚
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
              fileName: doc.docName + ext,
              filePath: fullPath,
              relativePath,
              fileSize: content.length,
              fileHash,
              mimeType: ext === ".md" ? "text/markdown" : "text/html",
              docType: doc.docType,
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
              reqId: doc.reqId,
              docType: doc.docType,
              docName: doc.docName,
            })
          );
        }
      },
      { timeout: 60000 }
    );

    // 9. Update KB lastSyncedAt
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { lastSyncedAt: new Date() },
    });

    console.log(`[doc-rag] Indexed document ${documentId} → ${chunks.length} chunks in KB ${kbId}`);
    return { chunks: chunks.length };
  } catch (err) {
    console.error(`[doc-rag] Failed to index document ${documentId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Remove a document from the RAG knowledge base.
 * Called when a document is deleted from the collaboration routes.
 */
export async function removeDocumentFromRAG(
  documentId: number
): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return;

    const ext = doc.docPath && !doc.docPath.startsWith("http")
      ? path.extname(doc.docPath).toLowerCase() : ".md";
    const diskFileName = `${doc.reqId}_${doc.docType}_${doc.docName}${ext}`.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
    const relativePath = diskFileName;

    const kbId = await getOrCreateProductDocKb();

    // Remove file from KB basePath
    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
    if (kb?.basePath) {
      const destPath = path.resolve(process.cwd(), kb.basePath, diskFileName);
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch { /* ignore */ }
      }
    }

    const kbDoc = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath },
    });

    if (kbDoc) {
      await prisma.knowledgeChunk.deleteMany({ where: { documentId: kbDoc.id } });
      await prisma.knowledgeDocument.delete({ where: { id: kbDoc.id } });
      console.log(`[doc-rag] Removed document ${documentId} from KB ${kbId}`);
    }
  } catch (err) {
    console.error(`[doc-rag] Failed to remove document ${documentId}:`, (err as Error).message);
    // Don't throw — deletion from collaboration should succeed even if RAG cleanup fails
  }
}

/**
 * Re-index all documents for a specific requirement.
 * Useful when a requirement is updated and its documents need to be refreshed.
 */
/**
 * One-time repair: copy already-indexed document files to KB basePath.
 * Fixes the sync issue where files were indexed in DB but missing from KB directory.
 */
export async function repairKbFileLinks(): Promise<{ copied: number; skipped: number }> {
  const kbId = await getOrCreateProductDocKb();
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
  if (!kb?.basePath) return { copied: 0, skipped: 0 };

  const kbDir = path.resolve(process.cwd(), kb.basePath);
  if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });

  const kbDocs = await prisma.knowledgeDocument.findMany({
    where: { knowledgeBaseId: kbId },
  });

  let copied = 0, skipped = 0;
  for (const kbDoc of kbDocs) {
    // Build new relativePath from the original file metadata extracted from old format
    // Old format: req:{reqId}:{docType}:{docName}
    // New format: {reqId}_{docType}_{docName}{ext} (sanitized filename on disk)
    const oldRel = kbDoc.relativePath || "";
    let newRel = oldRel;
    if (oldRel.startsWith("req:")) {
      const parts = oldRel.split(":"); // ["req", "reqId", "docType", "docName"]
      const reqId = parts[1] || "0";
      const docType = parts[2] || "OTHER";
      const docName = parts.slice(3).join("_");
      const ext = path.extname(kbDoc.fileName) || ".md";
      newRel = `${reqId}_${docType}_${docName}${ext}`.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
    }

    // Copy source file to KB basePath
    const destPath = path.join(kbDir, newRel);
    if (fs.existsSync(destPath)) { skipped++; continue; }
    if (kbDoc.filePath && fs.existsSync(kbDoc.filePath)) {
      fs.copyFileSync(kbDoc.filePath, destPath);
      copied++;
    } else {
      skipped++;
    }

    // Update relativePath in DB to new format
    if (newRel !== oldRel) {
      await prisma.knowledgeDocument.update({
        where: { id: kbDoc.id },
        data: { relativePath: newRel },
      });
    }
  }

  console.log(`[doc-rag] Repair: copied ${copied}, skipped ${skipped} files to KB basePath`);
  return { copied, skipped };
}

export async function reindexRequirementDocuments(
  reqId: number
): Promise<{ indexed: number; failed: number }> {
  const docs = await prisma.document.findMany({ where: { reqId } });
  let indexed = 0;
  let failed = 0;

  for (const doc of docs) {
    const result = await indexDocumentInRAG(doc.id);
    if (result) indexed++;
    else failed++;
  }

  return { indexed, failed };
}
