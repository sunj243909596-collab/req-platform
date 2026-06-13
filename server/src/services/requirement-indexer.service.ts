// Requirement / Release → RAG Knowledge Base indexer
// When a requirement or release is created/updated/deleted, this service
// syncs it as a single chunk into the "需求列表" KnowledgeBase.

import { prisma } from "../lib/prisma";
import path from "path";
import fs from "fs";
import { getEmbedder } from "./embedder.service";
import { readConfig } from "./agent-config.service";
import { prismaStore } from "./prisma.store";

const REQUIREMENT_KB_NAME = "需求列表";
const REQUIREMENT_KB_DISPLAY_NAME = "需求列表与发版计划";

/**
 * Get or create the "需求列表" KnowledgeBase.
 * Returns the KB id. Mirrors getOrCreateProductDocKb pattern.
 */
export async function getOrCreateRequirementKb(): Promise<number> {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { name: REQUIREMENT_KB_NAME },
  });

  if (kb) return kb.id;

  const basePath = path.posix.join("uploads", "kb", "requirement-list");
  kb = await prisma.knowledgeBase.create({
    data: {
      name: REQUIREMENT_KB_NAME,
      displayName: REQUIREMENT_KB_DISPLAY_NAME,
      description: "需求管理平台的结构化需求与发版计划,自动同步进 RAG 供智能检索",
      basePath,
      sourceType: "directory",
      docType: "REQUIREMENT_LIST",
      enabled: true,
      routingExamples: [
        { query: "找所有 P0 的入库需求", label: "需求查询" },
        { query: "V2.5 发版包含哪些需求", label: "发版查询" },
        { query: "谁负责 GSP 相关需求", label: "经办人查询" },
      ],
    },
  });

  // 占位目录(虽然 sourceType=directory 不放文件,但 kb-sync-job 可能扫)
  const dir = path.resolve(process.cwd(), basePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return kb.id;
}

/**
 * Render a Requirement record (with relations) into structured Markdown
 * used as a single RAG chunk.
 */
export function renderRequirementMarkdown(req: {
  reqNo: string;
  title: string;
  status: string;
  priority: string;
  background?: string | null;
  description?: string | null;
  designSolution?: string | null;
  module?: string | null;
  targetDate?: Date | null;
  tags?: unknown;
  groupName: string;
  reqType?: { code: string; displayName: string } | null;
  category?: { name: string; parent?: { name: string } | null } | null;
  release?: { versionNo: string } | null;
  assignee?: string | null;
  reporter?: string | null;
}): string {
  const typeLabel = req.reqType ? `${req.reqType.displayName} (${req.reqType.code})` : "未分类";
  const catPath = req.category
    ? [req.category.parent?.name, req.category.name].filter(Boolean).join(" / ")
    : "未分类";
  const tags = Array.isArray(req.tags) ? (req.tags as string[]).join("、") : "";
  const lines: string[] = [];

  lines.push(`【需求】${req.reqNo}`);
  lines.push(`标题:${req.title}`);
  lines.push(`类型:${typeLabel}`);
  lines.push(`分类:${catPath}`);
  if (req.module) lines.push(`模块:${req.module}`);
  lines.push(`状态:${req.status}`);
  lines.push(`优先级:${req.priority}`);
  if (req.assignee) lines.push(`经办人:${req.assignee}`);
  if (req.reporter) lines.push(`报告人:${req.reporter}`);
  if (req.targetDate) lines.push(`目标日期:${req.targetDate.toISOString().slice(0, 10)}`);
  if (tags) lines.push(`标签:${tags}`);
  lines.push(`所属组:${req.groupName}`);
  if (req.release) lines.push(`所属发版:${req.release.versionNo}`);

  if (req.background) {
    lines.push("", "## 背景", req.background);
  }
  if (req.description) {
    lines.push("", "## 描述", req.description);
  }
  if (req.designSolution) {
    lines.push("", "## 解决方案", req.designSolution);
  }

  return lines.join("\n");
}

const MAX_REQUIREMENTS_IN_CHUNK = 50;

/**
 * Render a Release (with associated requirements) into a single RAG chunk.
 * Truncates the requirement list to MAX_REQUIREMENTS_IN_CHUNK to keep
 * the chunk from diluting embedding quality.
 */
export function renderReleaseMarkdown(release: {
  versionNo: string;
  releaseName: string;
  status: string;
  description?: string | null;
  groupName: string;
  owner?: string | null;
  plannedDate?: Date | null;
  actualDate?: Date | null;
  requirements: Array<{
    reqNo: string;
    title: string;
    priority: string;
    status: string;
  }>;
}): { content: string; truncated: boolean; actualCount: number } {
  const actualCount = release.requirements.length;
  const displayed = release.requirements.slice(0, MAX_REQUIREMENTS_IN_CHUNK);
  const truncated = actualCount > MAX_REQUIREMENTS_IN_CHUNK;

  const lines: string[] = [];
  lines.push(`【发版计划】${release.versionNo} - ${release.releaseName}`);
  lines.push(`状态:${release.status}`);
  lines.push(`所属组:${release.groupName}`);
  if (release.owner) lines.push(`负责人:${release.owner}`);
  if (release.plannedDate) lines.push(`计划日期:${release.plannedDate.toISOString().slice(0, 10)}`);
  if (release.actualDate) lines.push(`实际日期:${release.actualDate.toISOString().slice(0, 10)}`);
  lines.push(`关联需求数:${actualCount}`);

  if (release.description) {
    lines.push("", "## 说明", release.description);
  }

  if (displayed.length > 0) {
    const header = truncated
      ? `## 关联需求(前 ${MAX_REQUIREMENTS_IN_CHUNK} 条 / 共 ${actualCount} 条)`
      : `## 关联需求(共 ${actualCount} 条)`;
    lines.push("", header);
    for (const r of displayed) {
      lines.push(`- ${r.reqNo}  [${r.priority} / ${r.status}]  ${r.title}`);
    }
  }

  return { content: lines.join("\n"), truncated, actualCount };
}

const REQUIREMENT_REL_PATH_PREFIX = "req_";

/**
 * Sync one Requirement into the "需求列表" KB as a single chunk.
 * Always rebuilds the single chunk (no hash check — structured data has no
 * stable "hash" concept; 1 chunk per req means 1 cheap rebuild).
 */
export async function indexRequirementInRAG(
  reqId: number
): Promise<{ chunks: number } | null> {
  try {
    const req = await prisma.requirement.findUnique({
      where: { id: reqId },
      include: {
        reqType: { select: { code: true, displayName: true } },
        category: { include: { parent: { select: { name: true } } } },
        release: { select: { versionNo: true } },
      },
    });
    if (!req || req.isDeleted) return null;

    const kbId = await getOrCreateRequirementKb();
    const relativePath = `${REQUIREMENT_REL_PATH_PREFIX}${req.id}.md`;
    const content = renderRequirementMarkdown(req);
    const contentTokens = Math.ceil(content.length / 3);

    const metadata = {
      reqId: req.id,
      docType: "REQUIREMENT_LIST",
      docName: req.reqNo,
      groupName: req.groupName,
      priority: req.priority,
      status: req.status,
      reqType: req.reqType?.code ?? null,
      gspImpact: req.gspImpact ?? null,
      releaseId: req.releaseId ?? null,
      updatedAt: req.updatedAt.toISOString(),
    };

    // Embed (外部 API,事务外)
    let embedding: number[] | null = null;
    try {
      const [emb] = await getEmbedder().embedTexts([content]);
      const expectedDim = readConfig().embeddingDimension ?? 1536;
      if (emb && emb.length === expectedDim && emb.every(Number.isFinite)) {
        embedding = emb;
      }
    } catch (embedErr) {
      console.warn(`[req-rag] embedding failed for req ${reqId}:`, (embedErr as Error).message);
    }

    const kbDocId = await prismaStore.upsertKnowledgeDocument(kbId, {
      fileName: `${req.reqNo}.md`,
      filePath: relativePath,
      relativePath,
      fileSize: content.length,
      fileHash: "structured",
      mimeType: "text/markdown",
      docType: "REQUIREMENT_LIST",
      chunkCount: 1,
    });
    await prismaStore.upsertKnowledgeChunks(kbDocId, [{
      chunkIndex: 0,
      content,
      contentTokens,
      embedding: embedding ?? [],
      metadata,
    }]);
    await prismaStore.updateKnowledgeBaseSyncTime(kbId);

    return { chunks: 1 };
  } catch (err) {
    console.error(`[req-rag] indexRequirementInRAG(${reqId}) failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Remove all chunks for a Requirement from the KB.
 * Called by soft delete / permanent delete / batch delete.
 */
export async function removeRequirementFromRAG(reqId: number): Promise<void> {
  try {
    const kbId = await getOrCreateRequirementKb();
    await prismaStore.deleteKnowledgeDocument(kbId, `${REQUIREMENT_REL_PATH_PREFIX}${reqId}.md`);
  } catch (err) {
    console.error(`[req-rag] removeRequirementFromRAG(${reqId}) failed:`, (err as Error).message);
  }
}

/** Alias of indexRequirementInRAG — used by admin "rebuild" UI */
export const reindexRequirementInRAG = indexRequirementInRAG;

const RELEASE_REL_PATH_PREFIX = "rel_";

/**
 * Sync one Release into the "需求列表" KB as a single chunk.
 */
export async function indexReleaseInRAG(
  releaseId: number
): Promise<{ chunks: number } | null> {
  try {
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        requirements: {
          where: { isDeleted: false },
          select: { reqNo: true, title: true, priority: true, status: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!release || release.isDeleted) return null;

    const kbId = await getOrCreateRequirementKb();
    const relativePath = `${RELEASE_REL_PATH_PREFIX}${release.id}.md`;
    const { content, truncated, actualCount } = renderReleaseMarkdown(release);
    const contentTokens = Math.ceil(content.length / 3);

    const metadata = {
      releaseId: release.id,
      docType: "REQUIREMENT_LIST",
      docName: `${release.versionNo} ${release.releaseName}`,
      groupName: release.groupName,
      status: release.status,
      plannedDate: release.plannedDate?.toISOString() ?? null,
      requirementCount: actualCount,
      truncated,
    };

    let embedding: number[] | null = null;
    try {
      const [emb] = await getEmbedder().embedTexts([content]);
      const expectedDim = readConfig().embeddingDimension ?? 1536;
      if (emb && emb.length === expectedDim && emb.every(Number.isFinite)) {
        embedding = emb;
      }
    } catch (embedErr) {
      console.warn(`[req-rag] embedding failed for release ${releaseId}:`, (embedErr as Error).message);
    }

    const kbDocId = await prismaStore.upsertKnowledgeDocument(kbId, {
      fileName: `${release.versionNo}.md`,
      filePath: relativePath,
      relativePath,
      fileSize: content.length,
      fileHash: "structured",
      mimeType: "text/markdown",
      docType: "REQUIREMENT_LIST",
      chunkCount: 1,
    });
    await prismaStore.upsertKnowledgeChunks(kbDocId, [{
      chunkIndex: 0,
      content,
      contentTokens,
      embedding: embedding ?? [],
      metadata,
    }]);
    await prismaStore.updateKnowledgeBaseSyncTime(kbId);

    return { chunks: 1 };
  } catch (err) {
    console.error(`[req-rag] indexReleaseInRAG(${releaseId}) failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Remove all chunks for a Release from the KB.
 */
export async function removeReleaseFromRAG(releaseId: number): Promise<void> {
  try {
    const kbId = await getOrCreateRequirementKb();
    await prismaStore.deleteKnowledgeDocument(kbId, `${RELEASE_REL_PATH_PREFIX}${releaseId}.md`);
  } catch (err) {
    console.error(`[req-rag] removeReleaseFromRAG(${releaseId}) failed:`, (err as Error).message);
  }
}

export const reindexReleaseInRAG = indexReleaseInRAG;

/**
 * Rebuild the entire "需求列表" KB from scratch.
 * Used by admin "rebuild" button in RagSettings.
 */
export async function rebuildRequirementKb(): Promise<{ indexed: number; failed: number }> {
  let indexed = 0;
  let failed = 0;

  const requirements = await prisma.requirement.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });
  for (const r of requirements) {
    const result = await indexRequirementInRAG(r.id);
    if (result) indexed++; else failed++;
  }

  const releases = await prisma.release.findMany({
    where: { isDeleted: false },
    select: { id: true },
  });
  for (const r of releases) {
    const result = await indexReleaseInRAG(r.id);
    if (result) indexed++; else failed++;
  }

  return { indexed, failed };
}
