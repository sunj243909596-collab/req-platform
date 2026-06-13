import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import type { AuthContext } from "../utils/access";


export interface CreateReleaseInput {
  versionNo: string;
  releaseName: string;
  status?: string;
  groupName: string;
  owner?: string;
  plannedDate?: string;
  description?: string;
  requirementIds?: number[]; // optional: associate requirements at creation
}

export async function listReleases(ctx: AuthContext, query: { page?: number; pageSize?: number; status?: string; groupName?: string }) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = { isDeleted: false };
  if (ctx.role !== "ADMIN" && ctx.groupName) where.groupName = ctx.groupName;
  if (query.status) where.status = query.status;
  if (query.groupName && ctx.role === "ADMIN") where.groupName = query.groupName;

  const [total, rows] = await Promise.all([
    prisma.release.count({ where }),
    prisma.release.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return { data: rows, total, page, pageSize };
}

export async function getRelease(ctx: AuthContext, id: number) {
  const release = await prisma.release.findFirst({
    where: {
      id,
      isDeleted: false,
      ...(ctx.role !== "ADMIN" && ctx.groupName ? { groupName: ctx.groupName } : {}),
    },
  });
  if (!release) throw new Error("发版不存在");
  return release;
}

export async function createRelease(input: CreateReleaseInput) {
  const existing = await prisma.release.findFirst({
    where: { versionNo: input.versionNo, isDeleted: false },
  });
  if (existing) throw new Error("版本号已存在");

  const release = await prisma.release.create({
    data: {
      versionNo: input.versionNo,
      releaseName: input.releaseName,
      status: input.status || "PLANNED",
      groupName: input.groupName,
      owner: input.owner,
      plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
      description: input.description,
    },
  });

  // Associate requirements if provided
  if (input.requirementIds?.length) {
    await prisma.requirement.updateMany({
      where: { id: { in: input.requirementIds } },
      data: { releaseId: release.id },
    });
  }

  // RAG: 创建后索引
  try {
    const { indexReleaseInRAG } = await import("./requirement-indexer.service");
    await indexReleaseInRAG(release.id);
  } catch (e) { console.warn("[req-rag] createRelease index failed:", (e as Error).message); }

  return release;
}

export async function updateRelease(id: number, input: Partial<CreateReleaseInput>) {
  const existing = await prisma.release.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new Error("发版不存在");

  const data: Record<string, unknown> = {};
  if (input.versionNo !== undefined) data.versionNo = input.versionNo;
  if (input.releaseName !== undefined) data.releaseName = input.releaseName;
  if (input.status !== undefined) data.status = input.status;
  if (input.groupName !== undefined) data.groupName = input.groupName;
  if (input.owner !== undefined) data.owner = input.owner;
  if (input.plannedDate !== undefined) data.plannedDate = input.plannedDate ? new Date(input.plannedDate) : null;
  if (input.description !== undefined) data.description = input.description;

  const updated = await prisma.release.update({ where: { id }, data });

  try {
    const { indexReleaseInRAG } = await import("./requirement-indexer.service");
    await indexReleaseInRAG(id);
  } catch (e) { console.warn("[req-rag] updateRelease index failed:", (e as Error).message); }

  return updated;
}

export async function deleteRelease(id: number) {
  const existing = await prisma.release.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new Error("发版不存在");

  const deleted = await prisma.release.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });

  try {
    const { removeReleaseFromRAG } = await import("./requirement-indexer.service");
    await removeReleaseFromRAG(id);
  } catch (e) { console.warn("[req-rag] deleteRelease remove failed:", (e as Error).message); }

  return deleted;
}

export async function submitForReview(id: number, reviewer: string) {
  const release = await prisma.release.findFirst({ where: { id, isDeleted: false } });
  if (!release) throw new Error("发版不存在");

  await prisma.release.update({ where: { id }, data: { status: "IN_REVIEW" } });
  await prisma.releaseReview.create({
    data: { releaseId: id, reviewer, action: "SUBMITTED" },
  });

  return prisma.release.findUnique({ where: { id } });
}

export async function reviewRelease(
  id: number,
  reviewer: string,
  action: "APPROVED" | "REJECTED",
  comment?: string
) {
  const release = await prisma.release.findFirst({ where: { id, isDeleted: false } });
  if (!release || release.status !== "IN_REVIEW") throw new Error("发版不在审核状态");

  await prisma.release.update({
    where: { id },
    data: { status: action === "APPROVED" ? "RELEASED" : "IN_DEV" },
  });
  await prisma.releaseReview.create({ data: { releaseId: id, reviewer, action, comment } });

  return prisma.release.findUnique({ where: { id } });
}

// ==================== Requirement Association ====================

export async function addRequirements(releaseId: number, requirementIds: number[]) {
  const release = await prisma.release.findFirst({ where: { id: releaseId, isDeleted: false } });
  if (!release) throw new Error("发版不存在");

  await prisma.requirement.updateMany({
    where: { id: { in: requirementIds }, isDeleted: false },
    data: { releaseId },
  });

  // RAG: 双写 — release chunk 含新需求列表 + 每条需求 chunk 的 metadata 刷新 releaseId
  try {
    const { indexReleaseInRAG, indexRequirementInRAG } = await import("./requirement-indexer.service");
    await indexReleaseInRAG(releaseId);
    await Promise.all(requirementIds.map((rid) => indexRequirementInRAG(rid).catch(() => null)));
  } catch (e) { console.warn("[req-rag] addRequirements dual-write failed:", (e as Error).message); }
}

export async function removeRequirement(releaseId: number, reqId: number) {
  const release = await prisma.release.findFirst({ where: { id: releaseId, isDeleted: false } });
  if (!release) throw new Error("发版不存在");

  await prisma.requirement.updateMany({
    where: { id: reqId, releaseId },
    data: { releaseId: null },
  });

  try {
    const { indexReleaseInRAG, indexRequirementInRAG } = await import("./requirement-indexer.service");
    await indexReleaseInRAG(releaseId);
    await indexRequirementInRAG(reqId);
  } catch (e) { console.warn("[req-rag] removeRequirement dual-write failed:", (e as Error).message); }
}

export interface UnassignedRequirementsQuery {
  releaseId?: number;
  groupName?: string;
  search?: string;
  priority?: "P0" | "P1" | "P2" | "P3";
  status?: string;
  assignee?: string;
  reqType?: "REQUIREMENT" | "BUG" | "IMPROVEMENT" | "TASK";
  module?: string;
  page?: number;
  pageSize?: number;
}

export async function getUnassignedRequirements(query: UnassignedRequirementsQuery = {}) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.RequirementWhereInput = { isDeleted: false };
  if (query.groupName) where.groupName = query.groupName;

  // 排除已纳入本发版的需求
  if (query.releaseId) {
    where.OR = [
      { releaseId: null },
      { releaseId: { not: query.releaseId } },
    ];
  } else {
    where.releaseId = null;
  }

  // 复用 listRequirements 的 where 风格
  if (query.search) {
    const searchFilter = [
      { title: { contains: query.search, mode: "insensitive" as const } },
      { reqNo: { contains: query.search, mode: "insensitive" as const } },
    ];
    where.AND = [{ OR: searchFilter }];
  }
  if (query.priority) where.priority = query.priority;
  if (query.status) where.status = query.status;
  if (query.assignee) where.assignee = { contains: query.assignee, mode: "insensitive" };
  if (query.module) where.module = query.module;
  if (query.reqType) {
    const t = await prisma.requirementType.findUnique({ where: { code: query.reqType } });
    where.reqTypeId = t?.id ?? -1;
  }

  const [total, rows] = await Promise.all([
    prisma.requirement.count({ where }),
    prisma.requirement.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        reqNo: true,
        title: true,
        priority: true,
        status: true,
        assignee: true,
        module: true,
        reqTypeId: true,
        groupName: true,
        updatedAt: true,
      },
    }),
  ]);

  // 批量查 status 颜色
  const { resolveStatusColors } = await import("../utils/serialize");
  const colorMap = await resolveStatusColors(
    rows.map((r) => ({ groupName: r.groupName, statusName: r.status }))
  );

  // 查 reqType code（批量，缓存）
  const reqTypeIds = [...new Set(rows.map((r) => r.reqTypeId).filter((id): id is number => !!id))];
  const reqTypes = reqTypeIds.length > 0
    ? await prisma.requirementType.findMany({ where: { id: { in: reqTypeIds } } })
    : [];
  const reqTypeMap = new Map(reqTypes.map((t) => [t.id, t.code as "REQUIREMENT" | "BUG" | "IMPROVEMENT" | "TASK"]));

  return {
    data: rows.map((r) => ({
      id: r.id,
      reqNo: r.reqNo,
      title: r.title,
      priority: r.priority as "P0" | "P1" | "P2" | "P3",
      status: r.status,
      statusColor: colorMap.get(`${r.groupName ?? ""}|${r.status}`) ?? null,
      assignee: r.assignee,
      reqType: (r.reqTypeId != null ? reqTypeMap.get(r.reqTypeId) : undefined) ?? "REQUIREMENT",
      module: r.module,
      groupName: r.groupName,
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
