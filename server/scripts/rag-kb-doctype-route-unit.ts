// 验证 routeKnowledgeBases docType 硬过滤旁路

import { routeKnowledgeBases } from "../src/services/kb-router.service";
import { prismaStore } from "../src/services/prisma.store";

const routing = await routeKnowledgeBases("找所有 P0 的入库需求", prismaStore, {
  filter: { docType: "REQUIREMENT_LIST" },
});

if (routing.method !== "docType") {
  console.error("expected method docType, got", routing.method);
  process.exit(1);
}
if (routing.kbIds.length === 0) {
  console.error("no kb matched REQUIREMENT_LIST");
  process.exit(1);
}

const bases = await prismaStore.listKnowledgeBasesForRouting();
const matched = bases.filter((b) => routing.kbIds.includes(b.id));
if (!matched.every((b) => b.docType === "REQUIREMENT_LIST")) {
  console.error("matched kb has wrong docType", matched);
  process.exit(1);
}

console.log("routing:", { method: routing.method, kbIds: routing.kbIds, labels: routing.labels });
console.log("ok");
