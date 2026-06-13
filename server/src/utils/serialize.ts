import type { Requirement } from "@prisma/client";
import type { RequirementDetail, RequirementListItem, CustomFieldValue } from "shared-types";
import { prisma } from "../lib/prisma";


/**
 * Fetch custom field values for a requirement, enriching with field metadata.
 * Returns array of { fieldId, fieldName, fieldKey, fieldType, value, required, options, placeholder }
 */
export async function getRequirementCustomValues(reqId: number): Promise<CustomFieldValue[]> {
  const rows = await prisma.reqCustomValue.findMany({
    where: { reqId },
    include: { field: true },
    orderBy: { field: { sortOrder: "asc" } },
  });
  return rows.map((r: { fieldId: number; value: string | null; field: { fieldName: string; fieldKey: string; fieldType: string; required: boolean; options: unknown; sortOrder: number; placeholder: string | null } }) => ({
    fieldId: r.fieldId,
    fieldName: r.field.fieldName,
    fieldKey: r.field.fieldKey,
    fieldType: r.field.fieldType,
    value: r.value ?? "",
    required: r.field.required,
    options: r.field.options as unknown[] | undefined,
    placeholder: r.field.placeholder ?? undefined,
  }));
}

// ============== 状态颜色查找(避免 N+1) ==============
// 一次查全表,在内存建索引:groupId(字符串化) -> statusName -> color
// 单个 group 找不到时,fallback 到该 statusName 在任意 group 的第一个 color。
let _statusColorCache: { ts: number; map: Map<string, Map<string, string>>; fallback: Map<string, string> } | null = null;
const COLOR_CACHE_TTL_MS = 60_000; // 60s 缓存(状态色很少改)

async function loadStatusColorIndex(): Promise<{ map: Map<string, Map<string, string>>; fallback: Map<string, string> }> {
  if (_statusColorCache && Date.now() - _statusColorCache.ts < COLOR_CACHE_TTL_MS) {
    return { map: _statusColorCache.map, fallback: _statusColorCache.fallback };
  }
  // 拉所有 workflow 状态 + workflow 的 groupId
  const rows = await prisma.workflowStatus.findMany({
    where: { color: { not: null } },
    select: {
      name: true,
      color: true,
      workflow: { select: { groupId: true } },
    },
  });
  const map = new Map<string, Map<string, string>>();      // groupId(string) -> name -> color
  const fallback = new Map<string, string>();              // name -> color(任意)
  for (const r of rows) {
    if (!r.color) continue;
    const gid = String(r.workflow?.groupId ?? -1);
    let m = map.get(gid);
    if (!m) { m = new Map(); map.set(gid, m); }
    if (!m.has(r.name)) m.set(r.name, r.color);            // 同 group 同名只取第一个
    if (!fallback.has(r.name)) fallback.set(r.name, r.color);
  }
  _statusColorCache = { ts: Date.now(), map, fallback };
  return { map, fallback };
}

/** 强制失效缓存(WorkflowDesigner 保存状态时调用) */
export function invalidateStatusColorCache(): void {
  _statusColorCache = null;
}

/**
 * 根据 groupName + statusName 查颜色。
 * groupName 优先;同 group 内同名未配置时,fallback 到任意 group 的同名色;都没有返回 null。
 */
export async function resolveStatusColor(groupName: string | null | undefined, statusName: string | null | undefined): Promise<string | null> {
  if (!statusName) return null;
  const { map, fallback } = await loadStatusColorIndex();
  if (groupName) {
    const group = await prisma.group.findUnique({ where: { groupName }, select: { id: true } });
    if (group) {
      const m = map.get(String(group.id));
      if (m) {
        const c = m.get(statusName);
        if (c) return c;
      }
    }
  }
  return fallback.get(statusName) ?? null;
}

/**
 * 批量版:一次给 N 个 (groupName, statusName) 查色。减少 group 查询次数。
 * 内部仍然共用同一份缓存。
 */
export async function resolveStatusColors(
  pairs: Array<{ groupName: string | null; statusName: string }>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (pairs.length === 0) return out;
  const { map, fallback } = await loadStatusColorIndex();

  // 按 groupName 预解析 groupId
  const groupNames = Array.from(new Set(pairs.map((p) => p.groupName).filter((g): g is string => !!g)));
  const groups = groupNames.length > 0
    ? await prisma.group.findMany({ where: { groupName: { in: groupNames } }, select: { id: true, groupName: true } })
    : [];
  const gidByName = new Map(groups.map((g) => [g.groupName, String(g.id)]));

  for (const { groupName, statusName } of pairs) {
    let color: string | undefined;
    if (groupName) {
      const gid = gidByName.get(groupName);
      if (gid != null) color = map.get(gid)?.get(statusName);
    }
    if (!color) color = fallback.get(statusName);
    if (color) out.set(`${groupName ?? ""}|${statusName}`, color);
  }
  return out;
}

export async function serializeRequirement(
  req: Requirement & { reqType?: { code: string } | null },
  extras?: { categoryPath?: string; customValues?: CustomFieldValue[] }
): Promise<RequirementDetail> {
  const statusColor = await resolveStatusColor(req.groupName, req.status);
  return {
    id: req.id,
    reqNo: req.reqNo,
    reqType: (req.reqType?.code ?? "REQUIREMENT") as RequirementDetail["reqType"],
    categoryId: req.categoryId != null ? req.categoryId : undefined,
    categoryPath: extras?.categoryPath,
    title: req.title,
    module: req.module ?? undefined,
    priority: req.priority as RequirementDetail["priority"],
    status: req.status,
    statusColor: statusColor,
    assignee: req.assignee ?? undefined,
    reporter: req.reporter ?? undefined,
    targetDate: req.targetDate?.toISOString().slice(0, 10),
    terminals: (req.terminals as string[] | null) ?? undefined,
    tags: (req.tags as string[] | null) ?? undefined,
    gspImpact: req.gspImpact ?? undefined,
    relatedTables: req.relatedTables ?? undefined,
    groupName: req.groupName,
    background: req.background ?? undefined,
    description: req.description ?? undefined,
    designSolution: req.designSolution ?? undefined,
    releaseId: req.releaseId ?? undefined,
    isDeleted: req.isDeleted,
    createdAt: req.createdAt.toISOString(),
    updatedAt: req.updatedAt.toISOString(),
    customValues: extras?.customValues,
  };
}

export async function serializeRequirementListItem(
  req: Requirement & { release?: { versionNo: string } | null; reqType?: { code: string } | null },
  extras?: { categoryPath?: string; testStats?: { total: number; passed: number; failed: number; regPassRate: number | null; regTotal: number }; customValues?: CustomFieldValue[] }
): Promise<RequirementListItem> {
  const statusColor = await resolveStatusColor(req.groupName, req.status);
  return {
    id: req.id,
    reqNo: req.reqNo,
    reqType: (req.reqType?.code ?? "REQUIREMENT") as RequirementListItem["reqType"],
    categoryId: req.categoryId != null ? req.categoryId : undefined,
    categoryPath: extras?.categoryPath,
    title: req.title,
    module: req.module ?? undefined,
    priority: req.priority as RequirementListItem["priority"],
    status: req.status,
    statusColor: statusColor,
    assignee: req.assignee ?? undefined,
    groupName: req.groupName,
    releaseVersion: req.release?.versionNo,
    tags: (req.tags as string[] | null) ?? undefined,
    updatedAt: req.updatedAt.toISOString(),
    testStats: extras?.testStats ? {
      total: extras.testStats.total,
      passed: extras.testStats.passed,
      failed: extras.testStats.failed,
      regPassRate: extras.testStats.regPassRate,
      regTotal: extras.testStats.regTotal,
    } : undefined,
    customValues: extras?.customValues,
  };
}
