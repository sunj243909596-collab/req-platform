import { PrismaClient, Prisma } from "@prisma/client";

/** 1-999 数字，1000-3573 转 A01-Z99（共 999 + 26×99 = 3573），超限抛错 */
export function encodeSeq(n: number): string {
  if (n <= 999) return String(n).padStart(3, "0");
  const overflow = n - 999; // 1..2574
  if (overflow > 26 * 99) throw new Error("编号序列超限（>3573）");
  const letterIdx = Math.floor((overflow - 1) / 99);
  const digit = ((overflow - 1) % 99) + 1;
  return String.fromCharCode(65 + letterIdx) + String(digit).padStart(2, "0");
}

/** encodeSeq 的逆运算；无法解析时返回 null */
export function decodeSeq(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  if (/^\d{3}$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n >= 1 && n <= 999 ? n : null;
  }

  const m = trimmed.match(/^([A-Z])(\d{2})$/);
  if (!m) return null;
  const letterIdx = m[1].charCodeAt(0) - 65;
  const digit = parseInt(m[2], 10);
  if (letterIdx < 0 || letterIdx > 25 || digit < 1 || digit > 99) return null;
  const n = 999 + letterIdx * 99 + digit;
  return n <= 3573 ? n : null;
}

export type CategorySegments = { catTop: string; catSub: string };

type CategoryLink = {
  id?: number;
  name?: string;
  parentId: number | null;
  code: string | null;
  parent?: CategoryLink | null;
};

/**
 * 从选中分类解析编码中的两段业务模块 code。
 *
 * 树结构：类型根(需求/缺陷…) → 一级模块(入库管理 RM) → 二级模块(收货 1001) → …
 * 编码：HD-{一级模块code}-{选中节点code}-{类型首字母}-{seq}
 *   - 选一级模块：HD-RM--F-001（第 3 段为空）
 *   - 选二级模块：HD-RM-1001-F-001
 */
export function resolveCategorySegments(category: CategoryLink): CategorySegments {
  const chain = buildCategoryChain(category);
  if (chain.length <= 1) {
    throw new Error("请选择具体业务分类，类型根节点（需求/缺陷/改进/任务）不参与编码");
  }

  const level1 = chain[1]!;
  if (!level1.code?.trim()) {
    throw new Error(`一级模块「${level1.name ?? ""}」的 code 不能为空（编码第 2 段，如 RM）`);
  }
  const catTop = level1.code.trim();

  if (chain.length === 2) {
    return { catTop, catSub: "" };
  }

  const selected = chain[chain.length - 1]!;
  if (!selected.code?.trim()) {
    throw new Error(`子模块「${selected.name ?? ""}」的 code 不能为空（编码第 3 段，如 1001）`);
  }

  return { catTop, catSub: selected.code.trim() };
}

/** 从嵌套 parent 链构建 [类型根, 一级模块, …, 选中节点] */
export function buildCategoryChain(category: CategoryLink): CategoryLink[] {
  const chain: CategoryLink[] = [];
  let cur: CategoryLink | null | undefined = category;
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent ?? null;
  }
  return chain;
}

/** 加载完整祖先链（支持超过 3 层分类树） */
export async function loadCategoryChain(
  db: PrismaClient | Prisma.TransactionClient,
  categoryId: number
): Promise<CategoryLink[]> {
  const chain: CategoryLink[] = [];
  let cur = await db.requirementCategory.findUnique({ where: { id: categoryId } });
  while (cur) {
    chain.unshift({
      id: cur.id,
      name: cur.name,
      parentId: cur.parentId,
      code: cur.code,
      parent: null,
    });
    if (!cur.parentId) break;
    cur = await db.requirementCategory.findUnique({ where: { id: cur.parentId } });
  }
  for (let i = 1; i < chain.length; i++) {
    chain[i]!.parent = chain[i - 1]!;
  }
  return chain;
}

/**
 * 从 5 段式自定义编码末段解析序列号。
 * 格式：{prefix}-{catTop}-{catSub}-{typeLetter}-{seq}
 */
export function parseSeqFromCustomReqNo(reqNo: string): number | null {
  const parts = reqNo.trim().split("-");
  if (parts.length < 5) return null;
  return decodeSeq(parts[parts.length - 1]!);
}

/** 不含 seq 的编码前缀，用于设置页展示计数桶 */
export function buildReqNoSegmentKey(
  rulePrefix: string,
  segments: CategorySegments,
  typeLetter: string
): string {
  return `${rulePrefix}-${segments.catTop}-${segments.catSub}-${typeLetter}`;
}

type SeqBucketEntry = { categoryId: number; reqTypeId: number; seq: number };

/** 将各计数桶的 currentSeq 提升到已观测到的最大 seq（只增不减） */
export async function syncSeqCounters(
  db: PrismaClient | Prisma.TransactionClient,
  entries: SeqBucketEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  const maxByBucket = new Map<string, number>();
  for (const { categoryId, reqTypeId, seq } of entries) {
    if (seq < 1) continue;
    const key = `${categoryId}:${reqTypeId}`;
    const prev = maxByBucket.get(key) ?? 0;
    if (seq > prev) maxByBucket.set(key, seq);
  }

  await Promise.all(
    Array.from(maxByBucket.entries()).map(async ([key, maxSeq]) => {
      const [categoryId, reqTypeId] = key.split(":").map(Number);
      const existing = await db.requirementSeqCounter.findUnique({
        where: { categoryId_reqTypeId: { categoryId, reqTypeId } },
      });
      if (!existing) {
        await db.requirementSeqCounter.create({
          data: { categoryId, reqTypeId, currentSeq: maxSeq },
        });
        return;
      }
      if (existing.currentSeq < maxSeq) {
        await db.requirementSeqCounter.update({
          where: { id: existing.id },
          data: { currentSeq: maxSeq },
        });
      }
    })
  );
}

/** 删除分类已不存在、类型根节点、或分类类型与计数桶类型不一致的孤儿桶 */
export async function purgeOrphanSeqCounters(db: PrismaClient): Promise<number> {
  const rows = await db.requirementSeqCounter.findMany({
    include: {
      category: { select: { reqTypeId: true, parentId: true } },
    },
  });
  const orphanIds = rows
    .filter(
      (c) =>
        !c.category ||
        c.category.parentId == null ||
        c.category.reqTypeId !== c.reqTypeId
    )
    .map((c) => c.id);
  if (orphanIds.length === 0) return 0;
  await db.requirementSeqCounter.deleteMany({ where: { id: { in: orphanIds } } });
  return orphanIds.length;
}

/** 扫描库内未删除需求，按 categoryId+reqTypeId+reqNo 末段回填计数桶 */
export async function reconcileSeqCountersFromDb(db: PrismaClient): Promise<void> {
  await purgeOrphanSeqCounters(db);

  const reqs = await db.requirement.findMany({
    where: {
      isDeleted: false,
      categoryId: { not: null },
      reqTypeId: { not: null },
    },
    select: {
      categoryId: true,
      reqTypeId: true,
      reqNo: true,
      category: { select: { reqTypeId: true, parentId: true } },
    },
  });

  const entries: SeqBucketEntry[] = [];
  for (const r of reqs) {
    if (r.categoryId == null || r.reqTypeId == null) continue;
    // 分类须属于同一类型树，且不能是类型根
    if (!r.category || r.category.parentId == null) continue;
    if (r.category.reqTypeId !== r.reqTypeId) continue;
    const seq = parseSeqFromCustomReqNo(r.reqNo);
    if (seq != null) {
      entries.push({ categoryId: r.categoryId, reqTypeId: r.reqTypeId, seq });
    }
  }

  await syncSeqCounters(db, entries);
  await purgeOrphanSeqCounters(db);
}

/** 原子自增「分类 + 类型」计数桶，返回新 seq 数值 */
export async function incrementSeqCounter(
  tx: Prisma.TransactionClient,
  args: { categoryId: number; reqTypeId: number }
): Promise<number> {
  const row = await tx.requirementSeqCounter.upsert({
    where: {
      categoryId_reqTypeId: {
        categoryId: args.categoryId,
        reqTypeId: args.reqTypeId,
      },
    },
    create: {
      categoryId: args.categoryId,
      reqTypeId: args.reqTypeId,
      currentSeq: 1,
    },
    update: { currentSeq: { increment: 1 } },
    select: { currentSeq: true },
  });
  return row.currentSeq;
}

/** 旧格式 REQ-{YYYY}-{NNN}（当规则未启用时用） */
export async function generateOldReqNo(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const latest = await prisma.requirement.findFirst({
    where: { reqNo: { startsWith: prefix } },
    orderBy: { reqNo: "desc" },
    select: { reqNo: true },
  });
  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(latest.reqNo.split("-")[2] || "0", 10);
    if (!Number.isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

/** 新格式 {prefix}-{一级模块code}-{选中节点code}-{typeLetter}-{seq} */
export async function generateCustomReqNo(
  tx: Prisma.TransactionClient,
  args: { reqTypeId: number; categoryId: number; prefix: string }
): Promise<string> {
  const chain = await loadCategoryChain(tx, args.categoryId);
  const category = chain[chain.length - 1];
  if (!category) throw new Error("分类不存在");

  const { catTop, catSub } = resolveCategorySegments(category);

  const type = await tx.requirementType.findUnique({ where: { id: args.reqTypeId } });
  if (!type) throw new Error("需求类型不存在");
  const typeLetter = (type.prefix || type.code || "X").slice(0, 1);

  const seqNum = await incrementSeqCounter(tx, {
    categoryId: args.categoryId,
    reqTypeId: args.reqTypeId,
  });

  const seq = encodeSeq(seqNum);
  return `${args.prefix}-${catTop}-${catSub}-${typeLetter}-${seq}`;
}
