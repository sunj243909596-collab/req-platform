// 验证:
// 1) indexRequirementInRAG 后,KB 内出现 1 个 chunk
// 2) removeRequirementFromRAG 后,chunk 消失
// 用真实 DB 操作(脚本会回滚状态,无副作用)
// 通过 try/finally 保证失败时也清理创建的需求和 RAG 文档。

import { prisma } from "../src/lib/prisma";
import { indexRequirementInRAG, removeRequirementFromRAG, getOrCreateRequirementKb } from "../src/services/requirement-indexer.service";

(async () => {
let created: { id: number } | null = null;
try {
// 取一个 category 和 reqType
const category = await prisma.requirementCategory.findFirst({ where: { name: { contains: "收货" } } });
const reqType = await prisma.requirementType.findFirst();
if (!category || !reqType) { console.error("seed data missing"); process.exit(1); }

// 取一个 group
const group = await prisma.group.findFirst();
if (!group) { console.error("no group"); process.exit(1); }

// 1. 创建需求
created = await prisma.requirement.create({
  data: {
    reqNo: `TEST-${Date.now()}`,
    title: "RAG ingest 单元测试",
    categoryId: category.id,
    reqTypeId: reqType.id,
    groupName: group.groupName,
    priority: "P0",
    status: "待评审",
    background: "测试背景",
    description: "测试描述",
  },
});
console.log("created req", created.id);

// 2. 索引
const result = await indexRequirementInRAG(created.id);
if (!result || result.chunks !== 1) { console.error("index failed", result); process.exit(1); }

// 3. 验证 chunk 存在
const kbId = await getOrCreateRequirementKb();
const chunks = await prisma.knowledgeChunk.findMany({
  where: { document: { knowledgeBaseId: kbId, relativePath: `req_${created.id}.md` } },
});
if (chunks.length !== 1) { console.error(`expected 1 chunk, got ${chunks.length}`); process.exit(1); }
if (!chunks[0].content.includes("RAG ingest 单元测试")) {
  console.error("chunk content wrong");
  process.exit(1);
}
const meta = chunks[0].metadata as Record<string, unknown>;
if (meta.reqId !== created.id || meta.priority !== "P0") {
  console.error("metadata wrong", meta);
  process.exit(1);
}
console.log("indexed ok, chunk id", chunks[0].id);

// 4. 删除
await removeRequirementFromRAG(created.id);
const afterRemove = await prisma.knowledgeChunk.findMany({
  where: { document: { knowledgeBaseId: kbId, relativePath: `req_${created.id}.md` } },
});
if (afterRemove.length !== 0) { console.error("remove failed"); process.exit(1); }
console.log("removed ok");

// 5. 清理测试数据
await prisma.requirement.delete({ where: { id: created.id } });
console.log("cleaned up");
created = null;

console.log("ok");
} catch (err) {
  // 抛回主流程,触发 finally 清理
  throw err;
} finally {
  if (created) {
    // 失败兜底:清理 RAG 文档 + 需求记录,避免污染 DB
    await removeRequirementFromRAG(created.id).catch(() => {});
    await prisma.requirement.delete({ where: { id: created.id } }).catch(() => {});
  }
}
})();
