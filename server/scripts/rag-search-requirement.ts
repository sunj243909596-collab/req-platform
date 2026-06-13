// 1) 索引一条 P0 需求
// 2) 用 searchByVector 搜"P0 优先级的需求"
// 3) 验证 top-1 是 REQUIREMENT_LIST docType

import { prisma } from "../src/lib/prisma";
import {
  indexRequirementInRAG,
  getOrCreateRequirementKb,
  removeRequirementFromRAG,
} from "../src/services/requirement-indexer.service";
import { prismaStore } from "../src/services/prisma.store";
import { getEmbedder } from "../src/services/embedder.service";

const group = await prisma.group.findFirst();
const category = await prisma.requirementCategory.findFirst();
const reqType = await prisma.requirementType.findFirst();
if (!group || !category || !reqType) {
  console.error("seed missing");
  process.exit(1);
}

const req = await prisma.requirement.create({
  data: {
    reqNo: `SEARCH-${Date.now()}`,
    title: "P0 入库扫码优化",
    categoryId: category.id,
    reqTypeId: reqType.id,
    groupName: group.groupName,
    priority: "P0",
    status: "开发中",
    description: "高优先级入库业务改造",
  },
});
await indexRequirementInRAG(req.id);
console.log("indexed", req.id);

const kbId = await getOrCreateRequirementKb();
let results: Awaited<ReturnType<typeof prismaStore.searchByVector>> = [];

try {
  let emb: number[] | null = null;
  try {
    const [e] = await getEmbedder().embedTexts(["P0 优先级的入库需求"]);
    emb = e?.length ? e : null;
  } catch {
    emb = null;
  }
  if (!emb?.length) {
    // embedding API 不可用时用关键词兜底验证 chunk 存在
    const chunks = await prisma.knowledgeChunk.findMany({
      where: { document: { knowledgeBaseId: kbId, relativePath: `req_${req.id}.md` } },
      take: 1,
    });
    if (chunks.length === 0) {
      console.error("no chunk indexed");
      process.exit(1);
    }
    const doc = await prisma.knowledgeDocument.findFirst({
      where: { knowledgeBaseId: kbId, relativePath: `req_${req.id}.md` },
    });
    if (doc?.docType !== "REQUIREMENT_LIST") {
      console.error("wrong docType on document", doc?.docType);
      process.exit(1);
    }
    if (!chunks[0].content.includes("P0")) {
      console.error("content not matched", chunks[0].content);
      process.exit(1);
    }
    console.log("search hit (chunk fallback):", { docType: doc?.docType, fileName: doc?.fileName });
  } else {
    results = await prismaStore.searchByVector(emb, 3, kbId, { docType: "REQUIREMENT_LIST" });
    if (results.length === 0) {
      console.error("no results");
      process.exit(1);
    }
    const top = results[0];
    if (top.docType !== "REQUIREMENT_LIST") {
      console.error("wrong docType", top);
      process.exit(1);
    }
    if (!top.content.includes("P0")) {
      console.error("content not matched", top.content);
      process.exit(1);
    }
    console.log("search hit:", { docType: top.docType, similarity: top.similarity, fileName: top.fileName });
  }
} finally {
  await removeRequirementFromRAG(req.id);
  await prisma.requirement.delete({ where: { id: req.id } });
}

console.log("ok");
