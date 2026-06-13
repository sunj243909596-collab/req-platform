import { prismaStore } from "../src/services/prisma.store.ts";
import { smartSearch } from "../src/services/rag-search.service.ts";
import { embedQueryText } from "../src/services/embedder.service.ts";

const q = process.argv[2] || "库存的表有哪些";
const { chunks, routing, rerankMethod } = await smartSearch(
  q,
  prismaStore,
  embedQueryText,
  { topK: 10 }
);

for (const c of chunks) {
  const hasWm = /wm_inventory/i.test(c.content);
  const hasInv = /inv_inventory/i.test(c.content);
  console.log("---", c.fileName, c.section || "", `sim=${c.similarity.toFixed(2)}`, hasWm ? "HAS_wm_inventory" : "", hasInv ? "HAS_inv_inventory" : "");
  console.log(c.content.slice(0, 280).replace(/\n/g, " "));
}

console.log("\nrouting:", JSON.stringify(routing), "rerank:", rerankMethod);
