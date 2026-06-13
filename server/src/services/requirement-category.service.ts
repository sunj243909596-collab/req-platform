import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type {
  CreateRequirementCategoryInput,
  RequirementCategoryNode,
  UpdateRequirementCategoryInput,
} from "shared-types";
import type { AuthContext } from "../utils/access";


const ROOT_CODES: string[] = ["REQUIREMENT", "BUG", "IMPROVEMENT", "TASK"];
/** 需求编码中的分类段：根 code / 子 code，如 RM、1001 */
const CATEGORY_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,30}$/;

function normalizeCategoryCode(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed.toUpperCase() : null;
}

function assertValidCategoryCode(code: string | null, label: string) {
  if (code == null) return;
  if (!CATEGORY_CODE_RE.test(code)) {
    throw new Error(
      `${label}格式无效，应为大写字母/数字开头，仅含大写字母、数字、下划线、横线，长度 1-31`
    );
  }
}

async function assertSiblingCodeUnique(
  parentId: number | null,
  code: string,
  excludeId?: number
) {
  const duplicate = await prisma.requirementCategory.findFirst({
    where: {
      parentId,
      code,
      ...(excludeId != null ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (duplicate) {
    throw new Error(`同级下已存在编码「${code}」的分类「${duplicate.name}」`);
  }
}

export async function ensureRootCategories() {
  // 从字典表读出所有启用的类型，按 sortOrder 建根分类
  const types = await prisma.requirementType.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: "asc" },
  });
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const existing = await prisma.requirementCategory.findFirst({
      where: { parentId: null, reqTypeId: t.id },
    });
    if (!existing) {
      await prisma.requirementCategory.create({
        data: {
          name: t.displayName,
          code: t.code,
          reqTypeId: t.id,
          sortOrder: i + 1,
        },
      });
    }
  }
}

type FlatCategory = {
  id: number;
  name: string;
  code: string | null;
  reqTypeId: number | null;
  reqType: { code: string } | null;
  parentId: number | null;
  sortOrder: number;
  enabled: boolean;
};

function buildTree(flat: FlatCategory[]): RequirementCategoryNode[] {
  return buildTreeWithCounts(flat.map(c => ({ ...c, count: 0 })), new Map());
}

/** 同级分类按编码排序（纯数字按数值，其余自然序；无编码排最后） */
function compareCategoryCode(a: string | null | undefined, b: string | null | undefined): number {
  const ca = (a ?? "").trim();
  const cb = (b ?? "").trim();
  if (!ca && !cb) return 0;
  if (!ca) return 1;
  if (!cb) return -1;
  if (/^\d+$/.test(ca) && /^\d+$/.test(cb)) {
    return parseInt(ca, 10) - parseInt(cb, 10);
  }
  return ca.localeCompare(cb, undefined, { numeric: true, sensitivity: "base" });
}

function sortSiblingCategories(
  parentId: number | null,
  list: (FlatCategory & { count: number })[],
  byId: Map<number, FlatCategory & { count: number }>
) {
  if (parentId === null) {
    // 类型根（需求/缺陷/改进/任务）保持手动 sortOrder
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    return;
  }
  const parent = byId.get(parentId);
  if (parent?.parentId == null) {
    // 一级模块：保持原有手动 sortOrder
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    return;
  }
  // 二级及以下：同级按 code 自动排序
  list.sort(
    (a, b) => compareCategoryCode(a.code, b.code) || a.sortOrder - b.sortOrder || a.id - b.id
  );
}

function buildTreeWithCounts(
  flat: (FlatCategory & { count: number })[],
  categoryCounts: Map<number, number>
): RequirementCategoryNode[] {
  const byParent = new Map<number | null, (FlatCategory & { count: number })[]>();
  const byId = new Map(flat.map((c) => [c.id, c]));
  for (const c of flat) {
    const key = c.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  for (const [parentId, list] of byParent) {
    sortSiblingCategories(parentId, list, byId);
  }

  const allDescendantIds = new Map<number | null, number[]>();

  const walk = (parentId: number | null): RequirementCategoryNode[] => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes.map((n) => {
      const children = walk(n.id);
      const descendantCount = children.reduce((sum, c) => sum + (c.totalCount ?? c.count ?? 0), 0);
      return {
        id: n.id,
        name: n.name,
        code: n.code ?? undefined,
        reqType: (n.reqType?.code ?? "REQUIREMENT") as RequirementCategoryNode["reqType"],
        parentId: n.parentId ?? undefined,
        sortOrder: n.sortOrder,
        enabled: n.enabled,
        isRoot: n.parentId == null,
        count: n.count,
        totalCount: (n.count ?? 0) + descendantCount,
        children,
      };
    });
  };
  return walk(null);
}

export async function listCategoryTree(): Promise<RequirementCategoryNode[]> {
  await ensureRootCategories();
  const flat = await prisma.requirementCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      requirements: { select: { id: true }, where: { isDeleted: false } },
      reqType: { select: { code: true } },
    },
  });

  // Get counts for each category
  const categoryCounts = new Map<number, number>();
  for (const cat of flat) {
    categoryCounts.set(cat.id, (cat as any).requirements?.length ?? 0);
  }

  // Build tree with counts
  return buildTreeWithCounts(flat.map(c => ({
    ...c,
    count: categoryCounts.get(c.id) ?? 0,
  })), categoryCounts);
}

export async function getCategoryById(id: number) {
  const cat = await prisma.requirementCategory.findUnique({ where: { id } });
  if (!cat) throw new Error("分类不存在");
  return cat;
}

/** 收集节点及其所有后代 id */
export async function collectDescendantCategoryIds(categoryId: number): Promise<number[]> {
  const flat = await prisma.requirementCategory.findMany({
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<number | null, number[]>();
  for (const c of flat) {
    const key = c.parentId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(c.id);
  }

  const out: number[] = [];
  const stack = [categoryId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const childId of childrenByParent.get(id) ?? []) {
      stack.push(childId);
    }
  }
  return out;
}

export function assertAdmin(ctx: AuthContext) {
  if (ctx.role !== "ADMIN") throw new Error("仅管理员可维护需求分类");
}

export async function createCategory(
  ctx: AuthContext,
  input: CreateRequirementCategoryInput
) {
  assertAdmin(ctx);
  const name = input.name?.trim();
  if (!name) throw new Error("分类名称不能为空");

  const parent = await getCategoryById(input.parentId);

  const duplicate = await prisma.requirementCategory.findFirst({
    where: { parentId: input.parentId, name },
  });
  if (duplicate) throw new Error(`同级下已存在名为「${name}」的分类`);

  const siblings = await prisma.requirementCategory.count({
    where: { parentId: input.parentId },
  });

  const code = normalizeCategoryCode(input.code);
  assertValidCategoryCode(code, "子分类编码");
  if (code) await assertSiblingCodeUnique(input.parentId, code);

  return prisma.requirementCategory.create({
    data: {
      name,
      code: code ?? undefined,
      reqTypeId: parent.reqTypeId,
      parentId: input.parentId,
      sortOrder: input.sortOrder ?? siblings + 1,
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateCategory(
  ctx: AuthContext,
  id: number,
  input: UpdateRequirementCategoryInput
) {
  assertAdmin(ctx);
  const existing = await getCategoryById(id);
  const isRoot = existing.parentId == null;

  if (isRoot) {
    if (input.parentId !== undefined && input.parentId !== null) {
      throw new Error("根分类不可移动");
    }
    if (input.enabled === false) throw new Error("根分类不可停用");
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) throw new Error("不能将分类设为自己的子级");
    const parent = await getCategoryById(input.parentId);
    if (parent.reqTypeId !== existing.reqTypeId) {
      throw new Error("子分类必须与根类型一致");
    }
    const descendants = await collectDescendantCategoryIds(id);
    if (descendants.includes(input.parentId)) {
      throw new Error("不能将分类移动到其子分类下");
    }
  }

  const data: Prisma.RequirementCategoryUpdateInput = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("分类名称不能为空");
    const targetParentId = input.parentId ?? existing.parentId;
    const duplicate = await prisma.requirementCategory.findFirst({
      where: { parentId: targetParentId, name: trimmed, NOT: { id } },
    });
    if (duplicate) throw new Error(`同级下已存在名为「${trimmed}」的分类`);
    data.name = trimmed;
  }
  if (input.code !== undefined) {
    const code = normalizeCategoryCode(input.code);
    const codeLabel = (input.parentId ?? existing.parentId) == null ? "根分类编码" : "子分类编码";
    assertValidCategoryCode(code, codeLabel);
    if (code) {
      await assertSiblingCodeUnique(input.parentId ?? existing.parentId, code, id);
    }
    data.code = code;
  }
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.parentId !== undefined) {
    data.parent = input.parentId
      ? { connect: { id: input.parentId } }
      : { disconnect: true };
  }

  return prisma.requirementCategory.update({ where: { id }, data });
}

export async function deleteCategory(ctx: AuthContext, id: number) {
  assertAdmin(ctx);
  const existing = await getCategoryById(id);
  if (existing.parentId == null) throw new Error("根分类不可删除");

  const [childCount, reqCount] = await Promise.all([
    prisma.requirementCategory.count({ where: { parentId: id } }),
    prisma.requirement.count({ where: { categoryId: id, isDeleted: false } }),
  ]);
  if (childCount > 0) throw new Error("请先删除子分类");
  if (reqCount > 0) throw new Error("该分类下仍有需求，无法删除");

  await prisma.requirementCategory.delete({ where: { id } });
}

/** 解析分类并返回 reqType（自动同步根类型） */
export async function resolveCategoryForRequirement(categoryId: number) {
  const cat = await getCategoryById(categoryId);
  if (!cat.enabled) throw new Error("所选分类已停用");
  return cat;
}

export async function buildCategoryPathMap(): Promise<Map<number, string>> {
  const flat = await prisma.requirementCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const byId = new Map(flat.map((c) => [c.id, c]));
  const cache = new Map<number, string>();

  const pathOf = (id: number): string => {
    const cached = cache.get(id);
    if (cached) return cached;
    const c = byId.get(id);
    if (!c) return "";
    const seg = c.name;
    if (c.parentId == null) {
      cache.set(id, seg);
      return seg;
    }
    const parentPath = pathOf(c.parentId);
    const full = parentPath ? `${parentPath} / ${seg}` : seg;
    cache.set(id, full);
    return full;
  };

  for (const c of flat) pathOf(c.id);
  return cache;
}
