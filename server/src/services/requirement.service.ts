import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type {
  CreateRequirementInput,
  DashboardStats,
  RequirementQuery,
  UpdateRequirementInput,
  CustomFieldValue,
} from "shared-types";
import {
  canDeleteRequirement,
  canEditRequirement,
  groupFilter,
  type AuthContext,
} from "../utils/access";
import { generateOldReqNo, generateCustomReqNo } from "../utils/req-no";
import fs from "fs";
import path from "path";
import { serializeRequirement, serializeRequirementListItem, getRequirementCustomValues } from "../utils/serialize";
import {
  buildCategoryPathMap,
  collectDescendantCategoryIds,
  resolveCategoryForRequirement,
} from "./requirement-category.service";
import { getRuleByTypeId } from "./requirement-number-rule.service";


const IN_PROGRESS_STATUSES = ["评审中", "设计中", "开发中", "测试中"];

export interface EnrichedDashboardStats {
  totalRequirements: number;
  inProgress: number;
  pendingReviewReleases: number;
  statusDistribution: { status: string; count: number; statusColor: string | null }[];
  priorityDistribution: { priority: string; count: number }[];
  recentRequirements: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  upcomingReleases: { id: number; releaseName: string; status: string; plannedDate: string | null; reqCount: number }[];
  myAssigned: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  testStats: { totalCases: number; passedCases: number; failedCases: number; passRate: number | null; regressionSuites: number; activeRegressions: number };
}

export async function listRequirements(ctx: AuthContext, query: RequirementQuery & { releaseId?: number }) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.RequirementWhereInput = {
    isDeleted: false,
    ...groupFilter(ctx),
  };

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { reqNo: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { background: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.reqType) {
    const t = await prisma.requirementType.findUnique({ where: { code: query.reqType } });
    where.reqTypeId = t?.id ?? -1;
  }
  if (query.categoryId) {
    const ids = await collectDescendantCategoryIds(query.categoryId);
    where.categoryId = { in: ids };
  }
  if (query.priority) where.priority = query.priority;
  if (query.status) where.status = query.status;
  if (query.assignee) where.assignee = { contains: query.assignee, mode: "insensitive" };
  if (query.module) where.module = query.module;
  if (query.groupName && ctx.role === "ADMIN") where.groupName = query.groupName;
  if (query.releaseId) where.releaseId = query.releaseId;

  const orderBy: Prisma.RequirementOrderByWithRelationInput = {};
  const sortBy = query.sortBy || "updatedAt";
  const sortOrder = query.sortOrder || "desc";
  if (sortBy === "reqNo") orderBy.reqNo = sortOrder;
  else if (sortBy === "priority") orderBy.priority = sortOrder;
  else if (sortBy === "createdAt") orderBy.createdAt = sortOrder;
  else orderBy.updatedAt = sortOrder;

  const [total, rows] = await Promise.all([
    prisma.requirement.count({ where }),
    prisma.requirement.findMany({
      where,
      skip,
      take: pageSize,
      orderBy,
      include: { release: { select: { versionNo: true } } },
    }),
  ]);

  const pathMap = await buildCategoryPathMap();

  // Batch-fetch test case stats for all returned reqIds
  const reqIds = rows.map(r => r.id);
  const statsMap = new Map<number, {
    total: number; passed: number; failed: number;
    regPassRate: number | null; regTotal: number;
  }>();
  // Batch-fetch custom field values for all returned reqIds
  const customValuesMap = new Map<number, CustomFieldValue[]>();
  if (reqIds.length > 0) {
    // Test case counts per req
    const tcCounts = await prisma.testCase.groupBy({
      by: ["reqId"], where: { reqId: { in: reqIds } },
      _count: { id: true },
    });
    for (const g of tcCounts) statsMap.set(g.reqId, { total: g._count.id, passed: 0, failed: 0, regPassRate: null, regTotal: 0 });

    // Latest test run per test case → pass/fail counts
    const allCases = await prisma.testCase.findMany({
      where: { reqId: { in: reqIds } },
      select: { id: true, reqId: true, runs: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
    });
    for (const tc of allCases) {
      const s = statsMap.get(tc.reqId) || { total: 0, passed: 0, failed: 0, regPassRate: null, regTotal: 0 };
      if (tc.runs.length > 0) {
        if (tc.runs[0].status === "passed") s.passed++;
        else if (tc.runs[0].status === "failed") s.failed++;
      }
      statsMap.set(tc.reqId, s);
    }

    // Latest regression run pass rate
    const regSuites = await prisma.regressionSuite.findMany({
      where: { reqId: { in: reqIds } },
      select: { reqId: true, runs: { orderBy: { createdAt: "desc" }, take: 1, select: { passCount: true, totalCount: true } } },
    });
    for (const rs of regSuites) {
      if (rs.runs.length > 0) {
        const s = statsMap.get(rs.reqId) || { total: 0, passed: 0, failed: 0, regPassRate: null, regTotal: 0 };
        const run = rs.runs[0];
        s.regPassRate = run.totalCount > 0 ? Math.round((run.passCount / run.totalCount) * 100) : null;
        s.regTotal = run.totalCount;
        statsMap.set(rs.reqId, s);
      }
    }

    // Custom field values per requirement
    const allCustomValues = await prisma.reqCustomValue.findMany({
      where: { reqId: { in: reqIds } },
      include: { field: true },
      orderBy: [{ reqId: "asc" }, { field: { sortOrder: "asc" } }],
    });
    for (const cv of allCustomValues) {
      const values = customValuesMap.get(cv.reqId) || [];
      values.push({
        fieldId: cv.fieldId,
        fieldName: cv.field.fieldName,
        fieldKey: cv.field.fieldKey,
        fieldType: cv.field.fieldType,
        value: cv.value ?? "",
        required: cv.field.required,
        options: cv.field.options as unknown[] | undefined,
        placeholder: cv.field.placeholder ?? undefined,
      });
      customValuesMap.set(cv.reqId, values);
    }
  }

  // 批量查 status 颜色(避免 N+1):一次 getAll,按 (groupName, status) 配对
  const { resolveStatusColors } = await import("../utils/serialize");
  const colorMap = await resolveStatusColors(
    rows.map((r) => ({ groupName: r.groupName, statusName: r.status }))
  );

  return {
    data: await Promise.all(
      rows.map((r) =>
        serializeRequirementListItem(r, {
          categoryPath: r.categoryId ? pathMap.get(r.categoryId) : undefined,
          testStats: statsMap.get(r.id),
          customValues: customValuesMap.get(r.id),
        })
      )
    ),
    total,
    page,
    pageSize,
  };
}

/**
 * Get all requirements matching filter (no pagination, for export).
 */
export async function getAllRequirementsForExport(ctx: AuthContext, query: RequirementQuery) {
  const where: Prisma.RequirementWhereInput = {
    isDeleted: false,
    ...groupFilter(ctx),
  };

  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { reqNo: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { background: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.reqType) {
    const t = await prisma.requirementType.findUnique({ where: { code: query.reqType } });
    where.reqTypeId = t?.id ?? -1;
  }
  if (query.categoryId) {
    const ids = await collectDescendantCategoryIds(query.categoryId);
    where.categoryId = { in: ids };
  }
  if (query.priority) where.priority = query.priority;
  if (query.status) where.status = query.status;
  if (query.assignee) where.assignee = { contains: query.assignee, mode: "insensitive" };
  if (query.module) where.module = query.module;
  if (query.groupName && ctx.role === "ADMIN") where.groupName = query.groupName;

  const rows = await prisma.requirement.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      category: { select: { name: true } },
      reqType: { select: { code: true } },
    },
  });

  const pathMap = await buildCategoryPathMap();
  return rows.map((r) => ({
    ...r,
    categoryPath: r.categoryId ? pathMap.get(r.categoryId) : undefined,
    tags: Array.isArray(r.tags) ? r.tags as string[] : [],
    terminals: Array.isArray(r.terminals) ? r.terminals as string[] : [],
  }));
}

export async function getRequirement(ctx: AuthContext, id: number) {
  const req = await prisma.requirement.findFirst({
    where: { id, isDeleted: false, ...groupFilter(ctx) },
    include: { reqType: { select: { code: true } } },
  });
  if (!req) throw new Error("需求不存在");
  const pathMap = await buildCategoryPathMap();
  const customValues = await getRequirementCustomValues(id);
  return await serializeRequirement(req, {
    categoryPath: req.categoryId ? pathMap.get(req.categoryId) : undefined,
    customValues,
  });
}

export async function createRequirement(ctx: AuthContext, input: CreateRequirementInput) {
  if (!input.categoryId) throw new Error("请选择需求分类");

  const category = await resolveCategoryForRequirement(input.categoryId);
  if (category.parentId == null) {
    throw new Error("请选择具体业务分类，类型根节点（需求/缺陷/改进/任务）不参与编码");
  }

  let reqTypeId: number | null = category.reqTypeId;
  if (input.reqType !== undefined && input.reqType !== "") {
    const t = await prisma.requirementType.findUnique({ where: { code: input.reqType } });
    if (!t) throw new Error(`未知的需求类型: ${input.reqType}`);
    reqTypeId = t.id;
    if (category.reqTypeId != null && category.reqTypeId !== t.id) {
      const catType = await prisma.requirementType.findUnique({
        where: { id: category.reqTypeId },
        select: { displayName: true, code: true },
      });
      throw new Error(
        `需求类型与分类不匹配：分类属于「${catType?.displayName ?? catType?.code}」，不能选「${t.displayName}」`
      );
    }
  }

  const groupName =
    ctx.role === "ADMIN" ? input.groupName : ctx.groupName || input.groupName;

  if (!groupName) throw new Error("未指定所属组");

  if (ctx.role !== "ADMIN" && ctx.groupName && groupName !== ctx.groupName) {
    throw new Error("无权在其他组创建需求");
  }

  const group = await prisma.group.findUnique({ where: { groupName } });
  if (!group) throw new Error("所属组不存在");

  const rule = await getRuleByTypeId(reqTypeId!);
  const reqNo = rule.enabled
    ? await generateCustomReqNo(prisma, {
        reqTypeId: reqTypeId!,
        categoryId: input.categoryId,
        prefix: rule.prefix,
      })
    : await generateOldReqNo(prisma);

  const req = await prisma.requirement.create({
    data: {
      reqNo,
      reqTypeId: reqTypeId ?? undefined,
      categoryId: input.categoryId,
      title: input.title,
      module: input.module,
      priority: input.priority,
      status: input.status || "待评审",
      assignee: input.assignee,
      reporter: input.reporter || ctx.username,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      terminals: input.terminals,
      tags: input.tags,
      gspImpact: input.gspImpact,
      relatedTables: input.relatedTables,
      groupName,
      background: input.background,
      description: input.description,
      designSolution: input.designSolution,
      releaseId: input.releaseId,
    },
    include: { reqType: { select: { code: true } } },
  });

  await prisma.activityLog.create({
    data: {
      reqId: req.id,
      actor: ctx.username,
      action: "CREATED",
      detail: { reqNo: req.reqNo, title: req.title },
    },
  });

  // Save custom field values if provided
  if (input.customValues && input.customValues.length > 0) {
    await prisma.reqCustomValue.createMany({
      data: input.customValues.map(cv => ({
        reqId: req.id,
        fieldId: cv.fieldId,
        value: cv.value,
      })),
    });
  }

  // RAG: 异步索引到"需求列表" KB(失败不阻塞)
  try {
    const { indexRequirementInRAG } = await import("./requirement-indexer.service");
    await indexRequirementInRAG(req.id);
  } catch (e) { console.warn("[req-rag] createRequirement index failed:", (e as Error).message); }

  const pathMap = await buildCategoryPathMap();
  const customValues = input.customValues && input.customValues.length > 0
    ? await getRequirementCustomValues(req.id)
    : undefined;
  return await serializeRequirement(req, {
    categoryPath: pathMap.get(input.categoryId),
    customValues,
  });
}

export async function updateRequirement(
  ctx: AuthContext,
  id: number,
  input: UpdateRequirementInput
) {
  const existing = await prisma.requirement.findFirst({
    where: { id, isDeleted: false, ...groupFilter(ctx) },
  });
  if (!existing) throw new Error("需求不存在");
  if (!canEditRequirement(ctx, existing)) throw new Error("无权编辑此需求");

  const data: Prisma.RequirementUpdateInput = {};
  const changes: { field: string; oldValue: string; newValue: string }[] = [];

  const track = (field: string, oldVal: unknown, newVal: unknown) => {
    if (newVal === undefined) return;
    const oldStr = oldVal == null ? "" : String(oldVal);
    const newStr = newVal == null ? "" : String(newVal);
    if (oldStr !== newStr) changes.push({ field, oldValue: oldStr, newValue: newStr });
  };

  if (input.categoryId !== undefined) {
    const category = await resolveCategoryForRequirement(input.categoryId);
    track("categoryId", existing.categoryId, input.categoryId);
    data.category = { connect: { id: input.categoryId } };
    // 同步 reqType：换 category 时通过 reqTypeId 同步
    if (category.reqTypeId) {
      data.reqType = { connect: { id: category.reqTypeId } };
    } else {
      data.reqType = { disconnect: true };
    }
  } else if (input.reqType !== undefined) {
    // 直接传 reqType (code) 时查 id
    const t = await prisma.requirementType.findUnique({ where: { code: input.reqType } });
    if (t) {
      data.reqType = { connect: { id: t.id } };
    } else {
      throw new Error(`未知的需求类型: ${input.reqType}`);
    }
  }
  if (input.title !== undefined) { track("title", existing.title, input.title); data.title = input.title; }
  if (input.module !== undefined) { track("module", existing.module, input.module); data.module = input.module; }
  if (input.priority !== undefined) { track("priority", existing.priority, input.priority); data.priority = input.priority; }
  if (input.status !== undefined) {
    if (input.status !== existing.status) {
      // Validate status transition using WorkflowDefinition system
      const { isTransitionAllowed, getAllowedNextStatuses } = await import("./workflow.service");
      const group = await prisma.group.findUnique({
        where: { groupName: existing.groupName },
        select: { id: true },
      });
      if (group) {
        const allowed = await isTransitionAllowed(group.id, existing.status, input.status);
        if (!allowed) {
          const allowedStatuses = await getAllowedNextStatuses(group.id, existing.status);
          throw new Error(
            `状态不可从「${existing.status}」直接变为「${input.status}」。` +
            `允许的流转：${allowedStatuses.join('、') || '无'}`
          );
        }
      }
    }
    track("status", existing.status, input.status);
    data.status = input.status;
  }
  if (input.assignee !== undefined) { track("assignee", existing.assignee, input.assignee); data.assignee = input.assignee; }
  if (input.targetDate !== undefined) {
    track("targetDate", existing.targetDate?.toISOString().slice(0, 10), input.targetDate);
    data.targetDate = input.targetDate ? new Date(input.targetDate) : null;
  }
  if (input.terminals !== undefined) { data.terminals = input.terminals; }
  if (input.tags !== undefined) { data.tags = input.tags; }
  if (input.gspImpact !== undefined) { track("gspImpact", existing.gspImpact, input.gspImpact); data.gspImpact = input.gspImpact; }
  if (input.relatedTables !== undefined) { track("relatedTables", existing.relatedTables, input.relatedTables); data.relatedTables = input.relatedTables; }
  if (input.background !== undefined) { data.background = input.background; }
  if (input.description !== undefined) { data.description = input.description; }
  if (input.designSolution !== undefined) { data.designSolution = input.designSolution; }
  if (input.releaseId !== undefined) { data.release = input.releaseId ? { connect: { id: input.releaseId } } : { disconnect: true }; }

  const req = await prisma.requirement.update({ where: { id }, data });

  for (const change of changes) {
    const action =
      change.field === "status"
        ? "STATUS_CHANGED"
        : change.field === "assignee"
          ? "ASSIGNED"
          : "UPDATED";

    await prisma.activityLog.create({
      data: {
        reqId: id,
        actor: ctx.username,
        action,
        fieldName: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      },
    });
  }

  // Handle custom field values (passed through from route even if not typed in UpdateRequirementInput)
  if ((input as any).customValues) {
    await upsertRequirementCustomValues(id, (input as any).customValues);
  }

  // RAG: 重新索引(结构化数据无 hash,1 chunk 重建廉价)
  try {
    const { indexRequirementInRAG } = await import("./requirement-indexer.service");
    await indexRequirementInRAG(id);
  } catch (e) { console.warn("[req-rag] updateRequirement index failed:", (e as Error).message); }

  const pathMap = await buildCategoryPathMap();
  const customValues = await getRequirementCustomValues(id);
  return await serializeRequirement(req, {
    categoryPath: req.categoryId ? pathMap.get(req.categoryId) : undefined,
    customValues,
  });
}

/** Save custom field values for a requirement (upsert: delete missing, insert/update existing) */
async function upsertRequirementCustomValues(reqId: number, customValues?: { fieldId: number; value: string }[]) {
  if (!customValues) return;
  const fieldIds = customValues.map(cv => cv.fieldId);
  await prisma.reqCustomValue.deleteMany({
    where: { reqId, fieldId: { notIn: fieldIds } },
  });
  for (const cv of customValues) {
    const existing = await prisma.reqCustomValue.findFirst({
      where: { reqId, fieldId: cv.fieldId },
    });
    if (existing) {
      await prisma.reqCustomValue.update({
        where: { id: existing.id },
        data: { value: cv.value },
      });
    } else {
      await prisma.reqCustomValue.create({
        data: { reqId, fieldId: cv.fieldId, value: cv.value },
      });
    }
  }
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function deleteRequirement(ctx: AuthContext, id: number) {
  const existing = await prisma.requirement.findFirst({
    where: { id, isDeleted: false, ...groupFilter(ctx) },
  });
  if (!existing) throw new Error("需求不存在");
  if (!canDeleteRequirement(ctx, existing)) throw new Error("无权删除此需求");

  // Delete attachment files from disk
  const attachments = await prisma.attachment.findMany({ where: { reqId: id } });
  for (const att of attachments) {
    const filePath = path.join(UPLOAD_DIR, att.filePath);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  // Delete document files from disk and clean up RAG KB
  const documents = await prisma.document.findMany({ where: { reqId: id } });
  for (const doc of documents) {
    if (doc.docPath && !doc.docPath.startsWith("http://") && !doc.docPath.startsWith("https://")) {
      const fullPath = path.join(process.cwd(), doc.docPath);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
        // Remove empty parent dir
        const parentDir = path.dirname(fullPath);
        try { fs.rmdirSync(parentDir); } catch { /* ignore */ }
      }
    }
  }
  // Also remove documents from RAG KB (use the RAG indexer service)
  try {
    const { removeDocumentFromRAG } = await import("./doc-rag-indexer.service");
    for (const doc of documents) {
      await removeDocumentFromRAG(doc.id);
    }
  } catch { /* ignore RAG cleanup errors */ }

  // Cascade delete all related data
  await prisma.$transaction([
    // SubTasks
    prisma.subTask.deleteMany({ where: { reqId: id } }),
    // ReqRelations (both directions)
    prisma.reqRelation.deleteMany({ where: { fromReqId: id } }),
    prisma.reqRelation.deleteMany({ where: { toReqId: id } }),
    // Comments
    prisma.comment.deleteMany({ where: { reqId: id } }),
    // Attachments
    prisma.attachment.deleteMany({ where: { reqId: id } }),
    // Documents
    prisma.document.deleteMany({ where: { reqId: id } }),
    // ActivityLogs
    prisma.activityLog.deleteMany({ where: { reqId: id } }),
    // ReqAgentInsights
    prisma.reqAgentInsight.deleteMany({ where: { reqId: id } }),
    // AnalysisCaches
    prisma.analysisCache.deleteMany({ where: { reqId: id } }),
    // ReqCustomValues
    prisma.reqCustomValue.deleteMany({ where: { reqId: id } }),
    // TestCases
    prisma.testRun.deleteMany({ where: { testCase: { reqId: id } } }),
    prisma.regressionSuiteItem.deleteMany({ where: { testCase: { reqId: id } } }),
    prisma.regressionSuite.deleteMany({ where: { reqId: id } }),
    prisma.testCase.deleteMany({ where: { reqId: id } }),
    // Notifications
    prisma.notification.deleteMany({ where: { reqId: id } }),
  ]);

  // Soft delete the requirement itself
  await prisma.requirement.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: ctx.username,
    },
  });

  // RAG: 软删时清 chunk
  try {
    const { removeRequirementFromRAG } = await import("./requirement-indexer.service");
    await removeRequirementFromRAG(id);
  } catch (e) { console.warn("[req-rag] deleteRequirement remove failed:", (e as Error).message); }

  await prisma.activityLog.create({
    data: { reqId: id, actor: ctx.username, action: "DELETED" },
  });
}

export async function batchDeleteRequirements(ctx: AuthContext, ids: number[]) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("请选择要删除的需求");
  const uniqueIds = [...new Set(ids)];

  // 阶段 1：校验全部 id 存在 + 当前用户有删除权限（任一失败则全部回滚）
  const existing = await prisma.requirement.findMany({
    where: { id: { in: uniqueIds }, isDeleted: false, ...groupFilter(ctx) },
  });
  const foundIds = new Set(existing.map((r) => r.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`需求不存在: ${missing.join(", ")}`);
  }
  for (const r of existing) {
    if (!canDeleteRequirement(ctx, r)) {
      throw new Error(`无权删除需求 #${r.reqNo}`);
    }
  }

  // 阶段 2：清理文件（先做 I/O，任何错误都中止）
  for (const id of uniqueIds) {
    const attachments = await prisma.attachment.findMany({ where: { reqId: id } });
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, att.filePath);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    const documents = await prisma.document.findMany({ where: { reqId: id } });
    for (const doc of documents) {
      if (doc.docPath && !doc.docPath.startsWith("http://") && !doc.docPath.startsWith("https://")) {
        const fullPath = path.join(process.cwd(), doc.docPath);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
          const parentDir = path.dirname(fullPath);
          try { fs.rmdirSync(parentDir); } catch { /* ignore */ }
        }
      }
    }
  }
  // RAG KB 清理（与单条 delete 保持一致，错误吞掉）
  try {
    const { removeDocumentFromRAG } = await import("./doc-rag-indexer.service");
    for (const id of uniqueIds) {
      const documents = await prisma.document.findMany({ where: { reqId: id } });
      for (const doc of documents) {
        await removeDocumentFromRAG(doc.id);
      }
    }
  } catch { /* ignore RAG cleanup errors */ }

  // 阶段 3：DB 清理（全部在一个 transaction，要么全成功要么全失败）
  await prisma.$transaction(async (tx) => {
    await tx.subTask.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.reqRelation.deleteMany({ where: { fromReqId: { in: uniqueIds } } });
    await tx.reqRelation.deleteMany({ where: { toReqId: { in: uniqueIds } } });
    await tx.comment.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.attachment.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.document.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.activityLog.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.reqAgentInsight.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.analysisCache.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.reqCustomValue.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.testRun.deleteMany({ where: { testCase: { reqId: { in: uniqueIds } } } });
    await tx.regressionSuiteItem.deleteMany({ where: { testCase: { reqId: { in: uniqueIds } } } });
    await tx.regressionSuite.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.testCase.deleteMany({ where: { reqId: { in: uniqueIds } } });
    await tx.notification.deleteMany({ where: { reqId: { in: uniqueIds } } });

    // 软删除本体
    await tx.requirement.updateMany({
      where: { id: { in: uniqueIds } },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: ctx.username,
      },
    });

    // 活动日志
    await tx.activityLog.createMany({
      data: uniqueIds.map((id) => ({ reqId: id, actor: ctx.username, action: "DELETED" })),
    });
  });

  // RAG: 批量软删时清 chunk
  for (const id of uniqueIds) {
    try {
      const { removeRequirementFromRAG } = await import("./requirement-indexer.service");
      await removeRequirementFromRAG(id);
    } catch (e) { console.warn("[req-rag] batchDelete remove failed:", (e as Error).message); }
  }
}

/** 回收站列表（admin 全可见；非 admin 仅看自己组的） */
export async function listTrashRequirements(
  ctx: AuthContext,
  query: { page?: number; pageSize?: number; search?: string; deletedBy?: string }
) {
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.RequirementWhereInput = {
    isDeleted: true,
    ...groupFilter(ctx),
  };
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { reqNo: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.deletedBy) where.deletedBy = query.deletedBy;

  const [total, rows] = await Promise.all([
    prisma.requirement.count({ where }),
    prisma.requirement.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { deletedAt: "desc" },
      include: {
        category: { select: { name: true, code: true } },
        reqType: { select: { code: true, displayName: true, color: true, prefix: true } },
      },
    }),
  ]);

  const pathMap = await buildCategoryPathMap();
  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id,
      reqNo: r.reqNo,
      title: r.title,
      reqType: r.reqType?.code ?? "REQUIREMENT",
      reqTypeDisplay: r.reqType?.displayName ?? r.reqType?.code ?? "REQUIREMENT",
      categoryPath: r.categoryId ? pathMap.get(r.categoryId) : undefined,
      groupName: r.groupName,
      priority: r.priority,
      status: r.status,
      assignee: r.assignee ?? undefined,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      deletedBy: r.deletedBy ?? null,
    })),
  };
}

/** 还原软删除的需求 */
export async function restoreRequirement(ctx: AuthContext, id: number) {
  const existing = await prisma.requirement.findFirst({
    where: { id, isDeleted: true, ...groupFilter(ctx) },
  });
  if (!existing) throw new Error("需求不存在或未删除");

  await prisma.requirement.update({
    where: { id },
    data: {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    },
  });
  await prisma.activityLog.create({
    data: { reqId: id, actor: ctx.username, action: "RESTORED" },
  });
}

/** 批量还原 */
export async function batchRestoreRequirements(ctx: AuthContext, ids: number[]) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("请选择要还原的需求");
  const uniqueIds = [...new Set(ids)];

  const existing = await prisma.requirement.findMany({
    where: { id: { in: uniqueIds }, isDeleted: true, ...groupFilter(ctx) },
    select: { id: true },
  });
  const foundIds = new Set(existing.map((r) => r.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`需求不存在或未删除: ${missing.join(", ")}`);
  }

  await prisma.$transaction([
    prisma.requirement.updateMany({
      where: { id: { in: uniqueIds } },
      data: { isDeleted: false, deletedAt: null, deletedBy: null },
    }),
    prisma.activityLog.createMany({
      data: uniqueIds.map((id) => ({ reqId: id, actor: ctx.username, action: "RESTORED" })),
    }),
  ]);
}

/** 永久删除（仅 admin） */
export async function permanentlyDeleteRequirement(ctx: AuthContext, id: number) {
  if (ctx.role !== "ADMIN") throw new Error("仅管理员可永久删除");
  const existing = await prisma.requirement.findUnique({ where: { id } });
  if (!existing) throw new Error("需求不存在");

  // 硬删除：关联数据（软删除时已清大部分）+ 需求本体
  await prisma.$transaction([
    prisma.subTask.deleteMany({ where: { reqId: id } }),
    prisma.reqRelation.deleteMany({ where: { fromReqId: id } }),
    prisma.reqRelation.deleteMany({ where: { toReqId: id } }),
    prisma.comment.deleteMany({ where: { reqId: id } }),
    prisma.attachment.deleteMany({ where: { reqId: id } }),
    prisma.document.deleteMany({ where: { reqId: id } }),
    prisma.activityLog.deleteMany({ where: { reqId: id } }),
    prisma.reqAgentInsight.deleteMany({ where: { reqId: id } }),
    prisma.analysisCache.deleteMany({ where: { reqId: id } }),
    prisma.reqCustomValue.deleteMany({ where: { reqId: id } }),
    prisma.testRun.deleteMany({ where: { testCase: { reqId: id } } }),
    prisma.regressionSuiteItem.deleteMany({ where: { testCase: { reqId: id } } }),
    prisma.regressionSuite.deleteMany({ where: { reqId: id } }),
    prisma.testCase.deleteMany({ where: { reqId: id } }),
    prisma.notification.deleteMany({ where: { reqId: id } }),
    prisma.requirement.delete({ where: { id } }),
  ]);

  try {
    const { removeRequirementFromRAG } = await import("./requirement-indexer.service");
    await removeRequirementFromRAG(id);
  } catch (e) { console.warn("[req-rag] permanentlyDelete remove failed:", (e as Error).message); }
}

/** 批量永久删除（仅 admin） */
export async function batchPermanentlyDeleteRequirements(ctx: AuthContext, ids: number[]) {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("请选择要永久删除的需求");
  if (ctx.role !== "ADMIN") throw new Error("仅管理员可永久删除");
  const uniqueIds = [...new Set(ids)];

  const existing = await prisma.requirement.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  const foundIds = new Set(existing.map((r) => r.id));
  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`需求不存在: ${missing.join(", ")}`);
  }

  await prisma.$transaction([
    prisma.subTask.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.reqRelation.deleteMany({ where: { fromReqId: { in: uniqueIds } } }),
    prisma.reqRelation.deleteMany({ where: { toReqId: { in: uniqueIds } } }),
    prisma.comment.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.attachment.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.document.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.activityLog.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.reqAgentInsight.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.analysisCache.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.reqCustomValue.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.testRun.deleteMany({ where: { testCase: { reqId: { in: uniqueIds } } } }),
    prisma.regressionSuiteItem.deleteMany({ where: { testCase: { reqId: { in: uniqueIds } } } }),
    prisma.regressionSuite.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.testCase.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.notification.deleteMany({ where: { reqId: { in: uniqueIds } } }),
    prisma.requirement.deleteMany({ where: { id: { in: uniqueIds } } }),
  ]);
}

export async function getRequirementHistory(ctx: AuthContext, id: number) {
  const req = await prisma.requirement.findFirst({
    where: { id, ...groupFilter(ctx) },
  });
  if (!req) throw new Error("需求不存在");

  return prisma.activityLog.findMany({
    where: { reqId: id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDashboardStats(ctx: AuthContext): Promise<EnrichedDashboardStats> {
  const baseWhere: Prisma.RequirementWhereInput = {
    isDeleted: false,
    ...groupFilter(ctx),
  };

  const [total, inProgress, pendingReviewReleases, statusGroups, priorityGroups] = await Promise.all([
    prisma.requirement.count({ where: baseWhere }),
    prisma.requirement.count({ where: { ...baseWhere, status: { in: IN_PROGRESS_STATUSES } } }),
    prisma.release.count({ where: { isDeleted: false, status: "IN_REVIEW", ...(ctx.role !== "ADMIN" && ctx.groupName ? { groupName: ctx.groupName } : {}) } }),
    // Status distribution
    prisma.requirement.groupBy({ by: ["status"], where: baseWhere, _count: { status: true } }),
    // Priority distribution
    prisma.requirement.groupBy({ by: ["priority"], where: baseWhere, _count: { priority: true } }),
  ]);

  const statusDistribution = statusGroups.map(g => ({ status: g.status, count: g._count.status }));
  // 用 ctx.groupName 查每个 status 的 color(dashboard 配色统一按当前用户所在 group)
  const { resolveStatusColors } = await import("../utils/serialize");
  const groupName = ctx.groupName ?? null;
  const colorMap = await resolveStatusColors(
    statusDistribution.map((d) => ({ groupName, statusName: d.status }))
  );
  const statusDistributionWithColor = statusDistribution.map((d) => ({
    ...d,
    statusColor: colorMap.get(`${groupName ?? ""}|${d.status}`) ?? null,
  }));
  const priorityDistribution = priorityGroups.map(g => ({ priority: g.priority, count: g._count.priority }));

  // Recent requirements (latest 5)
  const recentReqs = await prisma.requirement.findMany({
    where: baseWhere, orderBy: { updatedAt: "desc" }, take: 5,
    select: { id: true, reqNo: true, title: true, status: true, priority: true, updatedAt: true },
  });

  // Upcoming releases (latest 5, not deleted)
  const releases = await prisma.release.findMany({
    where: { isDeleted: false, ...(ctx.role !== "ADMIN" && ctx.groupName ? { groupName: ctx.groupName } : {}) },
    orderBy: { plannedDate: { sort: "asc", nulls: "last" } }, take: 5,
    select: { id: true, releaseName: true, status: true, plannedDate: true, _count: { select: { requirements: { where: { isDeleted: false } } } } },
  });

  // My assigned requirements
  const myAssigned = await prisma.requirement.findMany({
    where: { ...baseWhere, assignee: ctx.username },
    orderBy: { updatedAt: "desc" }, take: 5,
    select: { id: true, reqNo: true, title: true, status: true, priority: true, updatedAt: true },
  });

  // Test stats
  const [totalCases, passedCases, failedCases, regressionSuites, activeRegressions] = await Promise.all([
    prisma.testCase.count({ where: { req: { isDeleted: false, ...groupFilter(ctx) } } }),
    prisma.testCase.count({ where: { req: { isDeleted: false, ...groupFilter(ctx) }, runs: { some: { status: "passed" } } } }),
    prisma.testCase.count({ where: { req: { isDeleted: false, ...groupFilter(ctx) }, runs: { some: { status: "failed" } } } }),
    prisma.regressionSuite.count({ where: { req: { isDeleted: false, ...groupFilter(ctx) } } }),
    prisma.regressionRun.count({ where: { suite: { req: { isDeleted: false, ...groupFilter(ctx) } } } }),
  ]);
  const passRate = totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : null;

  return {
    totalRequirements: total,
    inProgress,
    pendingReviewReleases,
    statusDistribution: statusDistributionWithColor,
    priorityDistribution,
    recentRequirements: recentReqs.map(r => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      statusColor: colorMap.get(`${groupName ?? ""}|${r.status}`) ?? null,
    })),
    upcomingReleases: releases.map(r => ({
      id: r.id,
      releaseName: r.releaseName,
      status: r.status,
      plannedDate: r.plannedDate?.toISOString().split("T")[0] || null,
      reqCount: r._count.requirements,
    })),
    myAssigned: myAssigned.map(r => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      statusColor: colorMap.get(`${groupName ?? ""}|${r.status}`) ?? null,
    })),
    testStats: { totalCases, passedCases, failedCases, passRate, regressionSuites, activeRegressions },
  };
}

// ==================== Category Heatmap ====================

/**
 * 返回 6 周 × N 分类的需求热力图数据（GitHub contribution 风格）
 * - weeks: 从最早分类的第一周开始，到今天为止；每 7 天为一周（含未来 6 周？否：最近 6 周）
 * - categories: 启用且有需求的分类（按 total desc 取前 8）
 * - 每个 cell: { date(YYYY-MM-DD), count, uncompleted }
 *   - count: 该周内 createdAt 落在该分类的需求数
 *   - uncompleted: 上述需求中 status 仍在 IN_PROGRESS_STATUSES 的数量
 */
export interface HeatmapCell {
  date: string;
  count: number;
  uncompleted: number;
}

export interface HeatmapCategory {
  id: number;
  name: string;
  total: number;
  weeks: HeatmapCell[];
}

export async function getCategoryHeatmap(ctx: AuthContext, weeks = 6): Promise<{
  weekStartDates: string[];  // 每列的周一日期 YYYY-MM-DD
  categories: HeatmapCategory[];
  maxCount: number;          // 颜色映射用
}> {
  // 1. 计算 6 周的起始日（每周一）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay() || 7;  // Sun=0 → 7
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (dayOfWeek - 1));
  const weekStartDates: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(thisMonday.getDate() - i * 7);
    weekStartDates.push(d.toISOString().slice(0, 10));
  }
  const earliest = weekStartDates[0];
  // 范围 [earliest, today + 1 day)
  const latest = new Date(today);
  latest.setDate(today.getDate() + 1);

  // 2. 拉这 6 周内 createdAt 在范围内的需求
  const baseWhere: Prisma.RequirementWhereInput = {
    isDeleted: false,
    createdAt: { gte: new Date(earliest), lt: latest },
    ...groupFilter(ctx),
  };
  const rows = await prisma.requirement.findMany({
    where: baseWhere,
    select: { categoryId: true, createdAt: true, status: true },
  });

  // 3. 按 categoryId 聚合；同时统计每分类的总数（用全表范围）
  const byCat = new Map<number, { total: number; cells: Map<string, HeatmapCell> }>();
  for (const r of rows) {
    if (r.categoryId == null) continue;
    let bucket = byCat.get(r.categoryId);
    if (!bucket) {
      bucket = { total: 0, cells: new Map() };
      byCat.set(r.categoryId, bucket);
    }
    const createdDay = r.createdAt.toISOString().slice(0, 10);
    // 把日期归到所在周的周一
    const d = new Date(createdDay);
    const dow = d.getDay() || 7;
    d.setDate(d.getDate() - (dow - 1));
    const weekKey = d.toISOString().slice(0, 10);
    if (!weekStartDates.includes(weekKey)) continue;  // 超出窗口
    let cell = bucket.cells.get(weekKey);
    if (!cell) {
      cell = { date: weekKey, count: 0, uncompleted: 0 };
      bucket.cells.set(weekKey, cell);
    }
    cell.count++;
    if (IN_PROGRESS_STATUSES.includes(r.status)) cell.uncompleted++;
  }

  // 4. 取每个分类的全表总数（用于排序）
  const allTotals = await prisma.requirement.groupBy({
    by: ["categoryId"],
    where: { isDeleted: false, ...groupFilter(ctx), categoryId: { not: null } },
    _count: { _all: true },
  });
  const totalMap = new Map(allTotals.filter(g => g.categoryId != null).map(g => [g.categoryId!, g._count._all]));

  // 5. 读分类名称
  const catIds = Array.from(byCat.keys());
  const cats = catIds.length
    ? await prisma.requirementCategory.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true, enabled: true },
      })
    : [];
  const catMap = new Map(cats.map(c => [c.id, c]));

  // 6. 装配返回：只保留启用分类，按 6 周内总 count 降序，限 8 个
  const list: HeatmapCategory[] = catIds
    .filter(id => catMap.get(id)?.enabled)
    .map(id => {
      const bucket = byCat.get(id)!;
      const weeks_ = weekStartDates.map(d => bucket.cells.get(d) ?? { date: d, count: 0, uncompleted: 0 });
      return {
        id,
        name: catMap.get(id)!.name,
        total: totalMap.get(id) ?? 0,
        weeks: weeks_,
      };
    })
    .sort((a, b) => {
      const sumA = a.weeks.reduce((s, w) => s + w.count, 0);
      const sumB = b.weeks.reduce((s, w) => s + w.count, 0);
      return sumB - sumA;
    })
    .slice(0, 8);

  const maxCount = list.reduce((m, c) => Math.max(m, ...c.weeks.map(w => w.count)), 0);

  return { weekStartDates, categories: list, maxCount };
}

export async function getCategoryCounts(ctx: AuthContext, query: RequirementQuery & { releaseId?: number }): Promise<{ categoryId: number; count: number }[]> {
  const where: Prisma.RequirementWhereInput = {
    isDeleted: false,
    ...groupFilter(ctx),
  };
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { reqNo: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { background: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.reqType) {
    const t = await prisma.requirementType.findUnique({ where: { code: query.reqType } });
    where.reqTypeId = t?.id ?? -1;
  }
  if (query.categoryId) {
    const ids = await collectDescendantCategoryIds(query.categoryId);
    where.categoryId = { in: ids };
  }
  if (query.priority) where.priority = query.priority;
  if (query.status) where.status = query.status;
  if (query.assignee) where.assignee = { contains: query.assignee, mode: "insensitive" };
  if (query.module) where.module = query.module;
  if (query.groupName && ctx.role === "ADMIN") where.groupName = query.groupName;
  if (query.releaseId) where.releaseId = query.releaseId;

  const groups = await prisma.requirement.groupBy({
    by: ["categoryId"],
    where,
    _count: { categoryId: true },
  });
  return groups.map(g => ({ categoryId: g.categoryId!, count: g._count.categoryId }));
}

/** 返回数据库中实际存在的去重状态列表（用于状态筛选下拉） */
export async function getDistinctStatuses(ctx: AuthContext): Promise<string[]> {
  const groups = await prisma.requirement.groupBy({
    by: ["status"],
    where: { isDeleted: false, ...groupFilter(ctx) },
    orderBy: { status: "asc" },
  });
  return groups.map(g => g.status);
}

/** 返回数据库中实际存在的去重负责人列表（用于负责人筛选下拉） */
export async function getDistinctAssignees(ctx: AuthContext, groupName?: string): Promise<string[]> {
  const where: Prisma.RequirementWhereInput = {
    isDeleted: false,
    ...groupFilter(ctx),
    assignee: { not: null },
  };
  if (groupName && ctx.role === "ADMIN") where.groupName = groupName;
  const groups = await prisma.requirement.groupBy({
    by: ["assignee"],
    where,
    orderBy: { assignee: "asc" },
  });
  return groups.map((g) => g.assignee).filter((a): a is string => !!a);
}

// ==================== Custom Views ====================

export async function listViews(userId: number) {
  return prisma.requirementView.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createView(input: { userId: number; name: string; filters: Record<string, unknown>; sortBy?: string; sortOrder?: string; isDefault?: boolean }) {
  // Unset other defaults if this is default
  if (input.isDefault) {
    await prisma.requirementView.updateMany({
      where: { userId: input.userId },
      data: { isDefault: false },
    });
  }
  return prisma.requirementView.create({
    data: { ...input, filters: input.filters as Prisma.InputJsonValue },
  });
}

export async function updateView(id: number, data: { name?: string; filters?: Record<string, unknown>; sortBy?: string; sortOrder?: string; isDefault?: boolean }) {
  const { filters, ...rest } = data;
  await prisma.requirementView.update({
    where: { id },
    data: {
      ...rest,
      ...(filters !== undefined ? { filters: filters as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function deleteView(id: number) {
  await prisma.requirementView.delete({ where: { id } });
}
