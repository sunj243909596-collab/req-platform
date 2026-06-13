import { prisma } from "../lib/prisma";

/** 公共：已登录用户都能拉，按 sortOrder ASC，只返回启用的 */
export async function listEnabledTypes() {
  return prisma.requirementType.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

/** admin：全量（含 disabled），按 sortOrder ASC；附带引用计数（决定能否改 code） */
export async function listAllTypes() {
  const types = await prisma.requirementType.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  // 一次性统计所有 type 的用户引用次数（避免 N+1）
  // reqType 是需求的标签（类似 priority），不是结构性分组；软删除的需求不算
  const ids = types.map((t) => t.id);
  const reqGroups = await prisma.requirement.groupBy({
    by: ["reqTypeId"],
    where: { reqTypeId: { in: ids }, isDeleted: false },
    _count: { _all: true },
  });
  const reqMap = new Map(reqGroups.filter((g) => g.reqTypeId != null).map((g) => [g.reqTypeId!, g._count._all]));
  return types.map((t) => ({
    ...t,
    usageCount: { requirements: reqMap.get(t.id) ?? 0 },
  }));
}

export async function getTypeById(id: number) {
  return prisma.requirementType.findUnique({ where: { id } });
}

export async function getTypeByCode(code: string) {
  return prisma.requirementType.findUnique({ where: { code } });
}

export type CreateTypeInput = {
  code: string;
  displayName: string;
  color?: string;
  prefix?: string;
  sortOrder?: number;
  enabled?: boolean;
};

const CODE_RE = /^[A-Z][A-Z0-9_]{0,31}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export async function createType(input: CreateTypeInput) {
  if (!input.code?.trim()) throw new Error("编码不能为空");
  if (!input.displayName?.trim()) throw new Error("名称不能为空");
  if (!CODE_RE.test(input.code)) {
    throw new Error("编码必须以大写字母开头，仅含大写字母/数字/下划线，长度 ≤ 32");
  }
  if (input.color && !COLOR_RE.test(input.color)) {
    throw new Error("颜色格式错误，应为 #RRGGBB");
  }

  const existing = await prisma.requirementType.findUnique({ where: { code: input.code } });
  if (existing) throw new Error("编码已存在");

  return prisma.requirementType.create({
    data: {
      code: input.code,
      displayName: input.displayName,
      color: input.color ?? "#6b7280",
      prefix: input.prefix ?? "",
      sortOrder: input.sortOrder ?? 0,
      enabled: input.enabled ?? true,
    },
  });
}

export type UpdateTypeInput = {
  code?: string;
  displayName?: string;
  color?: string;
  prefix?: string;
  sortOrder?: number;
  enabled?: boolean;
};

/** code 仅在无引用时可改（避免破坏 API 响应中的 reqType 字符串值） */
export async function updateType(id: number, input: UpdateTypeInput) {
  const existing = await prisma.requirementType.findUnique({ where: { id } });
  if (!existing) throw new Error("类型不存在");
  if (input.color && !COLOR_RE.test(input.color)) {
    throw new Error("颜色格式错误，应为 #RRGGBB");
  }
  if (input.code !== undefined && input.code !== existing.code) {
    if (!CODE_RE.test(input.code)) {
      throw new Error("编码必须以大写字母开头，仅含大写字母/数字/下划线，长度 ≤ 32");
    }
    const dup = await prisma.requirementType.findUnique({ where: { code: input.code } });
    if (dup) throw new Error("编码已存在");
    const usage = await countUserUsage(id);
    if (usage.reqs > 0) {
      throw new Error(`类型被 ${usage.reqs} 条需求引用，无法修改编码`);
    }
  }

  return prisma.requirementType.update({
    where: { id },
    data: {
      code: input.code,
      displayName: input.displayName,
      color: input.color,
      prefix: input.prefix,
      sortOrder: input.sortOrder,
      enabled: input.enabled,
    },
  });
}

export async function toggleType(id: number) {
  const existing = await prisma.requirementType.findUnique({ where: { id } });
  if (!existing) throw new Error("类型不存在");
  return prisma.requirementType.update({
    where: { id },
    data: { enabled: !existing.enabled },
  });
}

async function countFullUsage(id: number): Promise<{ reqs: number; cats: number }> {
  const [reqs, cats] = await Promise.all([
    prisma.requirement.count({ where: { reqTypeId: id } }),
    prisma.requirementCategory.count({ where: { reqTypeId: id } }),
  ]);
  return { reqs, cats };
}

/** 改 code 时用的引用计数：reqType 是需求的标签（类似 priority），
 * 不是分类的结构性分组；软删除的需求也不算引用 */
async function countUserUsage(id: number): Promise<{ reqs: number }> {
  const reqs = await prisma.requirement.count({ where: { reqTypeId: id, isDeleted: false } });
  return { reqs };
}

export async function deleteType(id: number) {
  const existing = await prisma.requirementType.findUnique({ where: { id } });
  if (!existing) throw new Error("类型不存在");

  const { reqs, cats } = await countFullUsage(id);
  if (reqs > 0 || cats > 0) {
    throw new Error(`类型被 ${reqs} 条需求和 ${cats} 条分类引用，无法删除`);
  }

  await prisma.requirementType.delete({ where: { id } });
}
