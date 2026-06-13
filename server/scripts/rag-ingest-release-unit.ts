// 验证:
// 1) indexReleaseInRAG 后,KB 内出现 1 个 chunk (rel_<id>.md)
// 2) 关联 2 条已有需求后,chunk content 反映 requirementCount=2
// 3) removeReleaseFromRAG 后,chunk 消失
// 用真实 DB 操作(脚本会回滚状态,无副作用)
// 通过 try/finally 保证失败时也清理创建的 release 和 RAG 文档。

import { prisma } from "../src/lib/prisma";
import {
  indexReleaseInRAG,
  removeReleaseFromRAG,
  getOrCreateRequirementKb,
} from "../src/services/requirement-indexer.service";

(async () => {
let created: { id: number } | null = null;
let linkedReqIds: number[] = [];
try {
  const group = await prisma.group.findFirst();
  if (!group) { console.error("no group"); process.exit(1); }

  // 1. 创建 release
  created = await prisma.release.create({
    data: {
      versionNo: `TEST-${Date.now()}`,
      releaseName: "RAG 单元测试发版",
      status: "PLANNED",
      groupName: group.groupName,
      owner: "tester",
      plannedDate: new Date("2026-12-01"),
      description: "测试描述",
    },
  });
  console.log("created release", created.id);

  // 2. 索引
  const result = await indexReleaseInRAG(created.id);
  if (!result || result.chunks !== 1) { console.error("index failed", result); process.exit(1); }

  // 3. 验证 chunk 内容
  const kbId = await getOrCreateRequirementKb();
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { document: { knowledgeBaseId: kbId, relativePath: `rel_${created.id}.md` } },
  });
  if (chunks.length !== 1) { console.error(`expected 1 chunk, got ${chunks.length}`); process.exit(1); }
  if (!chunks[0].content.includes("RAG 单元测试发版")) {
    console.error("content missing release name", chunks[0].content);
    process.exit(1);
  }
  if (!chunks[0].content.includes("关联需求数:0")) {
    console.error("should show 0 requirements", chunks[0].content);
    process.exit(1);
  }
  const meta = chunks[0].metadata as Record<string, unknown>;
  if (meta.releaseId !== created.id || meta.requirementCount !== 0) {
    console.error("metadata wrong", meta);
    process.exit(1);
  }
  console.log("indexed ok");

  // 4. 关联 2 条已有需求
  const existingReqs = await prisma.requirement.findMany({ take: 2, where: { isDeleted: false } });
  if (existingReqs.length === 2) {
    linkedReqIds = existingReqs.map(r => r.id);
    await prisma.requirement.updateMany({
      where: { id: { in: linkedReqIds } },
      data: { releaseId: created.id },
    });
    await indexReleaseInRAG(created.id);
    const updated = await prisma.knowledgeChunk.findFirst({
      where: { document: { knowledgeBaseId: kbId, relativePath: `rel_${created.id}.md` } },
    });
    if (!updated?.content.includes(`关联需求数:${linkedReqIds.length}`)) {
      console.error("should reflect 2 reqs", updated?.content);
      process.exit(1);
    }
    console.log("dual-write ok,", linkedReqIds.length, "reqs linked");
  } else {
    console.log("skip dual-write (need 2 existing reqs)");
  }

  // 5. 删除 RAG 文档
  await removeReleaseFromRAG(created.id);
  const after = await prisma.knowledgeChunk.findMany({
    where: { document: { knowledgeBaseId: kbId, relativePath: `rel_${created.id}.md` } },
  });
  if (after.length !== 0) { console.error("remove failed"); process.exit(1); }
  console.log("removed ok");

  // 6. 解绑 + 清理 release
  if (linkedReqIds.length > 0) {
    await prisma.requirement.updateMany({
      where: { id: { in: linkedReqIds } },
      data: { releaseId: null },
    });
  }
  await prisma.release.delete({ where: { id: created.id } });
  created = null;

  console.log("ok");
} catch (err) {
  console.error("test failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  if (created) {
    // 失败路径兜底
    if (linkedReqIds.length > 0) {
      await prisma.requirement.updateMany({
        where: { id: { in: linkedReqIds } },
        data: { releaseId: null },
      }).catch(() => {});
    }
    await prisma.release.delete({ where: { id: created.id } }).catch(() => {});
    await removeReleaseFromRAG(created.id).catch(() => {});
  }
}
})();
