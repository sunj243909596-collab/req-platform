// 一次性数据补索引
// 运行: npx tsx scripts/ingest-existing-requirements.ts

import { prisma } from "../src/lib/prisma";
import {
  indexRequirementInRAG,
  indexReleaseInRAG,
  getOrCreateRequirementKb,
} from "../src/services/requirement-indexer.service";

const kbId = await getOrCreateRequirementKb();
console.log("kbId=", kbId);

const before = await prisma.knowledgeChunk.count({
  where: { document: { knowledgeBaseId: kbId } },
});
console.log("chunks before:", before);

let reqOk = 0,
  reqFail = 0,
  relOk = 0,
  relFail = 0;

const reqs = await prisma.requirement.findMany({
  where: { isDeleted: false },
  select: { id: true },
});
console.log("indexing", reqs.length, "requirements...");
for (let i = 0; i < reqs.length; i++) {
  const r = await indexRequirementInRAG(reqs[i].id);
  if (r) reqOk++;
  else reqFail++;
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${reqs.length}`);
}

const rels = await prisma.release.findMany({
  where: { isDeleted: false },
  select: { id: true },
});
console.log("indexing", rels.length, "releases...");
for (let i = 0; i < rels.length; i++) {
  const r = await indexReleaseInRAG(rels[i].id);
  if (r) relOk++;
  else relFail++;
}

const after = await prisma.knowledgeChunk.count({
  where: { document: { knowledgeBaseId: kbId } },
});
console.log("chunks after:", after);
console.log(`summary: req ok=${reqOk} fail=${reqFail}, release ok=${relOk} fail=${relFail}`);
console.log("ok");
