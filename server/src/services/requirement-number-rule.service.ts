import { prisma } from "../lib/prisma";
import {
  buildReqNoSegmentKey,
  encodeSeq,
  loadCategoryChain,
  reconcileSeqCountersFromDb,
  resolveCategorySegments,
} from "../utils/req-no";

const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/;  // 1-10 字符大写字母+数字

export type RequirementSeqCounterItem = {
  id: number;
  categoryId: number;
  reqTypeId: number;
  segmentKey: string;
  categoryPath: string;
  reqTypeCode: string;
  reqTypeName: string;
  typeLetter: string;
  currentSeq: number;
  nextSeq: string;
};

async function resolveReqTypeId(reqTypeCode: string): Promise<number> {
  const type = await prisma.requirementType.findUnique({ where: { code: reqTypeCode } });
  if (!type) throw new Error(`未知的需求类型: ${reqTypeCode}`);
  return type.id;
}

async function findRuleByTypeId(reqTypeId: number) {
  return prisma.requirementNumberRule.findFirst({ where: { reqTypeId } });
}

/** 获取指定类型的编码规则（不存在则创建默认行） */
export async function getRule(reqTypeCode: string) {
  const reqTypeId = await resolveReqTypeId(reqTypeCode);
  let rule = await findRuleByTypeId(reqTypeId);
  if (!rule) {
    rule = await prisma.requirementNumberRule.create({
      data: { enabled: false, prefix: "REQ", reqTypeId },
    });
  }
  return rule;
}

/** 创建需求时按类型取规则 */
export async function getRuleByTypeId(reqTypeId: number) {
  let rule = await findRuleByTypeId(reqTypeId);
  if (!rule) {
    rule = await prisma.requirementNumberRule.create({
      data: { enabled: false, prefix: "REQ", reqTypeId },
    });
  }
  return rule;
}

export async function updateRule(
  reqTypeCode: string,
  input: { enabled: boolean; prefix: string }
) {
  if (input.prefix !== undefined && !PREFIX_RE.test(input.prefix)) {
    throw new Error("前缀必须是大写字母+数字，长度 1-10");
  }
  const reqTypeId = await resolveReqTypeId(reqTypeCode);
  const existing = await findRuleByTypeId(reqTypeId);
  if (existing) {
    return prisma.requirementNumberRule.update({
      where: { id: existing.id },
      data: { enabled: input.enabled, prefix: input.prefix },
    });
  }
  return prisma.requirementNumberRule.create({
    data: { enabled: input.enabled, prefix: input.prefix, reqTypeId },
  });
}

/** 列出指定类型下各「分类 + 类型」计数桶 */
export async function listSeqCounters(reqTypeCode: string): Promise<RequirementSeqCounterItem[]> {
  const reqTypeId = await resolveReqTypeId(reqTypeCode);
  await reconcileSeqCountersFromDb(prisma);
  const rule = await getRuleByTypeId(reqTypeId);

  const counters = await prisma.requirementSeqCounter.findMany({
    where: {
      reqTypeId,
      category: { reqTypeId, parentId: { not: null } },
    },
    include: { reqType: true },
    orderBy: [{ categoryId: "asc" }],
  });

  return Promise.all(
    counters.map(async (c) => {
      const chain = await loadCategoryChain(prisma, c.categoryId);
      const category = chain[chain.length - 1]!;
      let segments: { catTop: string; catSub: string };
      try {
        segments = resolveCategorySegments(category);
      } catch {
        segments = { catTop: "?", catSub: "?" };
      }
      const typeLetter = (c.reqType.prefix || c.reqType.code || "X").slice(0, 1);
      const segmentKey = buildReqNoSegmentKey(rule.prefix, segments, typeLetter);
      const categoryPath = chain.map((n) => n.name ?? "").join(" / ");

      return {
        id: c.id,
        categoryId: c.categoryId,
        reqTypeId: c.reqTypeId,
        segmentKey,
        categoryPath,
        reqTypeCode: c.reqType.code,
        reqTypeName: c.reqType.displayName,
        typeLetter,
        currentSeq: c.currentSeq,
        nextSeq: encodeSeq(c.currentSeq + 1),
      };
    })
  );
}
