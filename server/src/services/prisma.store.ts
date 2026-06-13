// Prisma Data Store — implements AgentDataStore interface
// Connects the Agent service to PostgreSQL via Prisma

import { Prisma, PrismaClient } from "@prisma/client";
import path from "path";
import { parseRoutingExamples, type KbRoutingExample } from "./kb-routing-examples";
import type { AgentDataStore } from "./agent.service";
import type { RagDocumentFilter } from "./rag-search.service";
import type { ChatMessage } from "shared-types";
import { readConfig } from "./agent-config.service";
import {
  tokenizeSearchQuery,
  buildOrTsQueryText,
  normalizeKeywordScore,
} from "./keyword-search.util";

const prisma = new PrismaClient();

function routingExamplesFromDb(raw: unknown): KbRoutingExample[] | null {
  if (raw == null) return null;
  try {
    return parseRoutingExamples(raw);
  } catch {
    return null;
  }
}

export const prismaStore: AgentDataStore = {
  // ==================== Conversations ====================

  async createConversation(data) {
    const conv = await prisma.conversation.create({
      data: {
        userId: data.userId,
        title: data.title,
        contextType: data.contextType,
        contextId: data.contextId,
      },
    });
    return { id: conv.id };
  },

  async getConversationMessages(conversationId: number): Promise<ChatMessage[]> {
    const messages = await prisma.conversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return messages.map(m => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      metadata: m.metadata as ChatMessage["metadata"],
    }));
  },

  async addMessage(conversationId, role, content, metadata?) {
    const msg = await prisma.conversationMessage.create({
      data: {
        conversationId,
        role,
        content,
        ...(metadata ? { metadata: metadata as object } : {}),
      },
    });
    // Update conversation metadata
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messageCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    return { id: msg.id };
  },

  async getConversations(userId) {
    const convs = await prisma.conversation.findMany({
      where: { userId, isArchived: false },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, contextType: true, contextId: true,
        messageCount: true, updatedAt: true,
      },
    });
    return convs.map(c => ({
      ...c,
      updatedAt: c.updatedAt.toISOString(),
      title: c.title as string | null,
      contextId: c.contextId as number | null,
    }));
  },

  async updateConversation(id, data) {
    await prisma.conversation.update({ where: { id }, data });
  },

  async deleteConversation(id) {
    // Cascade delete messages
    await prisma.conversationMessage.deleteMany({ where: { conversationId: id } });
    await prisma.conversation.delete({ where: { id } });
  },

  // ==================== Knowledge Base ====================

  async listKnowledgeBasesForRouting() {
    const bases = await prisma.knowledgeBase.findMany({
      where: { enabled: true },
      orderBy: { id: "asc" },
      include: {
        documents: {
          include: { chunks: { select: { id: true } } },
        },
      },
    });
    return bases.map((b) => ({
      id: b.id,
      name: b.name,
      displayName: b.displayName,
      description: b.description,
      routingExamples: routingExamplesFromDb(b.routingExamples),
      docType: b.docType,
      enabled: b.enabled,
      chunkCount: b.documents.reduce((sum, d) => sum + d.chunks.length, 0),
    }));
  },

  async getDefaultKnowledgeBaseId() {
    const kb = await prisma.knowledgeBase.findFirst({
      where: { enabled: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (!kb) throw new Error("未找到已启用的知识库，请先在设置中创建并启用知识库");
    return kb.id;
  },

  async searchByVector(
    embedding: number[],
    topK: number,
    kbId: number,
    filter?: RagDocumentFilter
  ) {
    if (!embedding || embedding.length === 0) return [];
    if (!kbId) return [];

    const vectorStr = `[${embedding.join(",")}]`;
    const params: unknown[] = [vectorStr, topK, kbId];
    const extraWhere: string[] = [];

    if (filter?.docType) {
      params.push(filter.docType);
      extraWhere.push(`AND kd.doc_type = $${params.length}`);
    }
    if (filter?.pathPrefix) {
      params.push(`${filter.pathPrefix}%`);
      extraWhere.push(`AND kd.relative_path LIKE $${params.length}`);
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      chunk_id: number; document_id: number;
      content: string; file_name: string;
      relative_path: string;
      doc_type: string | null;
      section: string | null; similarity: number;
    }>>(
      `SELECT
        kc.id as chunk_id,
        kc.document_id,
        kc.content,
        kd.file_name,
        kd.relative_path,
        kd.doc_type,
        kc.metadata->>'headingPath' as section,
        1 - (kc.embedding <=> $1::vector) as similarity
      FROM "KnowledgeChunk" kc
      JOIN "KnowledgeDocument" kd ON kc.document_id = kd.id
      WHERE kc.embedding IS NOT NULL
        AND kd.knowledge_base_id = $3
        ${extraWhere.join(" ")}
      ORDER BY kc.embedding <=> $1::vector
      LIMIT $2`,
      ...params
    );

    return rows.map(r => {
      const retrievalChars = readConfig().rag.chunkRetrievalChars ?? 6000;
      return {
        content: r.content.slice(0, retrievalChars),
        fileName: r.file_name,
        section: r.section || undefined,
        relativePath: r.relative_path,
        docType: r.doc_type || undefined,
        similarity: Math.max(0, Number(r.similarity)),
        chunkId: r.chunk_id,
        documentId: r.document_id,
      };
    });
  },

  async searchKnowledgeBase(
    query: string,
    topK: number,
    kbId: number,
    filter?: RagDocumentFilter
  ) {
    const keywords = tokenizeSearchQuery(query);
    if (keywords.length === 0 || !kbId) return [];

    const orTsQuery = buildOrTsQueryText(keywords);
    if (!orTsQuery) return [];

    // $1=topK  $2=kbId  $3=OR-tsquery-text (e.g. "wms | 收货 | lpn")
    const params: unknown[] = [topK, kbId, orTsQuery];
    const extraWhere: string[] = [];

    if (filter?.docType) {
      params.push(filter.docType);
      extraWhere.push(`AND kd.doc_type = $${params.length}`);
    }
    if (filter?.pathPrefix) {
      params.push(`${filter.pathPrefix}%`);
      extraWhere.push(`AND kd.relative_path LIKE $${params.length}`);
    }

    const rows = await prisma.$queryRawUnsafe<Array<{
      chunk_id: number;
      document_id: number;
      content: string;
      file_name: string;
      relative_path: string;
      doc_type: string | null;
      section: string | null;
      raw_score: number;
    }>>(
      `SELECT
         kc.id                                                   AS chunk_id,
         kc.document_id,
         kc.content,
         kd.file_name,
         kd.relative_path,
         kd.doc_type,
         kc.metadata->>'headingPath'                            AS section,
         ts_rank_cd(kc.search_vector, to_tsquery('simple', $3)) AS raw_score
       FROM "KnowledgeChunk" kc
       JOIN "KnowledgeDocument" kd ON kc.document_id = kd.id
       WHERE kd.knowledge_base_id = $2
         AND kc.search_vector @@ to_tsquery('simple', $3)
         ${extraWhere.join(" ")}
       ORDER BY raw_score DESC
       LIMIT $1`,
      ...params
    );

    const retrievalChars = readConfig().rag.chunkRetrievalChars ?? 6000;
    return rows.map((r) => ({
      content: r.content.slice(0, retrievalChars),
      fileName: r.file_name,
      section: r.section || undefined,
      relativePath: r.relative_path,
      docType: r.doc_type || undefined,
      similarity: normalizeKeywordScore(Number(r.raw_score)),
      chunkId: r.chunk_id,
      documentId: r.document_id,
    }));
  },

  async getKnowledgeDocumentByPath(relativePath) {
    return prisma.knowledgeDocument.findFirst({
      where: { relativePath },
      select: { filePath: true, fileName: true, relativePath: true },
    });
  },

  async getKnowledgeDocumentHashes(kbId) {
    const docs = await prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: kbId },
      select: { relativePath: true, fileHash: true },
    });
    const map = new Map<string, string>();
    for (const d of docs) map.set(d.relativePath, d.fileHash);
    return map;
  },

  async deleteKnowledgeDocument(kbId, relativePath) {
    const doc = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath },
    });
    if (doc) {
      await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });
      await prisma.knowledgeDocument.delete({ where: { id: doc.id } });
    }
  },

  async upsertKnowledgeDocument(kbId, data) {
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath: data.relativePath },
    });

    if (existing) {
      // Delete old chunks
      await prisma.knowledgeChunk.deleteMany({ where: { documentId: existing.id } });
      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: {
          fileSize: data.fileSize, fileHash: data.fileHash,
          chunkCount: data.chunkCount, indexedAt: new Date(),
        },
      });
      return existing.id;
    }

    const doc = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId: kbId,
        fileName: data.fileName,
        filePath: data.filePath,
        relativePath: data.relativePath,
        fileSize: data.fileSize,
        fileHash: data.fileHash,
        mimeType: data.mimeType,
        docType: data.docType,
        chunkCount: data.chunkCount,
        indexedAt: new Date(),
      },
    });
    return doc.id;
  },

  async upsertKnowledgeChunks(docId, chunks) {
    if (chunks.length === 0) return;
    const expectedDim = readConfig().embeddingDimension ?? 1536;

    await prisma.$transaction(
      async (tx) => {
        for (const c of chunks) {
          const emb = c.embedding;
          let vectorExpr: string;
          if (emb && emb.length > 0) {
            if (emb.length !== expectedDim) {
              console.warn(
                `[rag] Dimension mismatch: got ${emb.length}, expected ${expectedDim}. ` +
                `Storing without embedding. Check embeddingModel/embeddingDimension in Agent settings.`
              );
              vectorExpr = "NULL";
            } else if (!emb.every(Number.isFinite)) {
              console.warn(`[rag] Embedding contains non-finite values (NaN/Inf), storing as NULL.`);
              vectorExpr = "NULL";
            } else {
              vectorExpr = `'[${emb.join(",")}]'::vector`;
            }
          } else {
            vectorExpr = "NULL";
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO "KnowledgeChunk" (document_id, chunk_index, content, content_tokens, embedding, metadata)
             VALUES ($1, $2, $3, $4, ${vectorExpr}, $5::jsonb)`,
            docId, c.chunkIndex, c.content, c.contentTokens,
            JSON.stringify(c.metadata)
          );
        }
      },
      { timeout: 60000 }
    );
  },

  async updateKnowledgeBaseSyncTime(kbId) {
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { lastSyncedAt: new Date() },
    });
  },

  async listKnowledgeBases() {
    const bases = await prisma.knowledgeBase.findMany({
      include: {
        documents: {
          include: { chunks: { select: { id: true } } },
        },
      },
    });
    return bases.map(b => ({
      id: b.id,
      name: b.name,
      displayName: b.displayName,
      description: b.description,
      routingExamples: routingExamplesFromDb(b.routingExamples),
      sourceType: b.sourceType as "directory" | "upload",
      docType: b.docType,
      documentCount: b.documents.length,
      chunkCount: b.documents.reduce((sum, d) => sum + d.chunks.length, 0),
      lastSyncedAt: b.lastSyncedAt?.toISOString() || null,
      enabled: b.enabled,
    }));
  },

  async createKnowledgeBase(data) {
    const routingExamples =
      data.routingExamples !== undefined
        ? parseRoutingExamples(data.routingExamples)
        : undefined;
    const sourceType = data.sourceType || "directory";
    let kb = await prisma.knowledgeBase.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        basePath:
          sourceType === "upload"
            ? path.posix.join("uploads", "kb", "_pending")
            : data.basePath,
        routingExamples:
          routingExamples !== undefined
            ? (routingExamples as unknown as Prisma.InputJsonValue)
            : undefined,
        sourceType,
        docType: data.docType,
        enabled: data.enabled ?? true,
      },
    });
    if (sourceType === "upload") {
      const basePath = path.posix.join("uploads", "kb", String(kb.id));
      kb = await prisma.knowledgeBase.update({
        where: { id: kb.id },
        data: { basePath },
      });
    }
    return kb;
  },

  async updateKnowledgeBase(id, data) {
    const { routingExamples, ...rest } = data;
    const patch: Prisma.KnowledgeBaseUpdateInput = { ...rest };
    if (routingExamples !== undefined) {
      patch.routingExamples = parseRoutingExamples(
        routingExamples
      ) as unknown as Prisma.InputJsonValue;
    }
    await prisma.knowledgeBase.update({ where: { id }, data: patch });
  },

  async deleteKnowledgeBase(id) {
    const docs = await prisma.knowledgeDocument.findMany({ where: { knowledgeBaseId: id } });
    for (const doc of docs) {
      await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });
    }
    await prisma.knowledgeDocument.deleteMany({ where: { knowledgeBaseId: id } });
    await prisma.knowledgeBase.delete({ where: { id } });

    // Reclaim disk space after bulk delete — PostgreSQL MVCC doesn't auto-free
    await prisma.$executeRawUnsafe(`VACUUM "KnowledgeChunk"`);
    await prisma.$executeRawUnsafe(`VACUUM "KnowledgeDocument"`);
  },

  async getKnowledgeBase(id) {
    return prisma.knowledgeBase.findUnique({ where: { id } });
  },

  async getKnowledgeBaseStatus(id) {
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        documents: {
          include: { chunks: { select: { id: true } } },
        },
      },
    });
    if (!kb) throw new Error("Knowledge base not found");
    const chunkCount = kb.documents.reduce((sum, d) => sum + d.chunks.length, 0);
    return {
      id: kb.id, name: kb.name,
      sourceType: kb.sourceType as "directory" | "upload",
      documentCount: kb.documents.length,
      chunkCount,
      lastSyncedAt: kb.lastSyncedAt?.toISOString() || null,
      enabled: kb.enabled,
    };
  },

  // ==================== Requirements ====================

  async getRequirementDetail(reqId) {
    const req = await prisma.requirement.findUnique({
      where: { id: reqId },
      include: { reqType: { select: { code: true } } },
    });
    if (!req) throw new Error("Requirement not found");
    return {
      reqNo: req.reqNo, title: req.title,
      reqType: req.reqType?.code ?? "REQUIREMENT", priority: req.priority,
      module: req.module || undefined, status: req.status,
      description: req.description || undefined,
      relatedTables: req.relatedTables || undefined,
      gspImpact: req.gspImpact || undefined,
    };
  },

  async getAllRequirementEmbeddings() {
    // Use raw SQL to fetch the vector column (Prisma Unsupported type)
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: number; req_no: string; title: string;
      priority: string; status: string;
      embedding: number[] | null;
    }>>(
      `SELECT id, req_no, title, priority, status, 
              embedding::float4[] as embedding
       FROM "Requirement"
       WHERE is_deleted = false AND embedding IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 500`
    );
    return rows.map(r => ({
      id: r.id,
      reqNo: r.req_no,
      title: r.title,
      priority: r.priority,
      status: r.status,
      embedding: r.embedding,
    }));
  },

  // ==================== Releases ====================

  async getReleaseInfo(releaseId) {
    const rel = await prisma.release.findUnique({ where: { id: releaseId } });
    if (!rel) throw new Error("Release not found");
    return {
      releaseName: rel.releaseName,
      description: rel.description || undefined,
      plannedDate: rel.plannedDate?.toISOString(),
    };
  },

  async getReleaseRequirements(releaseId) {
    const reqs = await prisma.requirement.findMany({
      where: { releaseId, isDeleted: false },
      select: { id: true, reqNo: true, title: true, priority: true, status: true, module: true },
    });
    return reqs.map(r => ({ ...r, module: r.module || undefined }));
  },

  async getRequirementsByIds(ids) {
    const reqs = await prisma.requirement.findMany({
      where: { id: { in: ids } },
      select: { reqNo: true, title: true, description: true },
    });
    return reqs.map(r => ({
      reqNo: r.reqNo, title: r.title,
      description: r.description || undefined,
    }));
  },

  // ==================== Insights ====================

  async saveInsight(reqId, type, data, model) {
    await prisma.reqAgentInsight.create({
      data: {
        reqId, insightType: type,
        structuredData: data as unknown as Prisma.InputJsonValue,
        content: typeof data === "string" ? data : null,
        model,
      },
    });
  },

  async getInsights(reqId) {
    return prisma.reqAgentInsight.findMany({
      where: { reqId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },

  async saveRequirementEmbedding(reqId: number, embedding: number[]) {
    const vectorStr = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "Requirement" SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      reqId
    );
  },
};
