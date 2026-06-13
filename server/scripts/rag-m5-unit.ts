import { expandSearchQueries, mergeHybridChunks } from "agent";
import { resolveDocumentFilter } from "../src/services/rag-search.service.ts";

const expanded = expandSearchQueries("WMS 收货 ASN 流程", 3);
if (expanded.length < 2) {
  console.error("expandSearchQueries failed", expanded);
  process.exit(1);
}

const hybrid = mergeHybridChunks(
  [{ content: "v1", fileName: "a.md", similarity: 0.8, chunkId: 1, documentId: 1 }],
  [{ content: "v1", fileName: "a.md", similarity: 0.3, chunkId: 1, documentId: 1 }],
  0.7,
  0.3
);
if (hybrid.length !== 1 || hybrid[0].similarity <= 0.5) {
  console.error("mergeHybridChunks failed", hybrid);
  process.exit(2);
}

const f = resolveDocumentFilter({ pathPrefix: "docs/" });
if (!f?.pathPrefix) {
  console.error("resolveDocumentFilter failed");
  process.exit(3);
}

console.log("ok");
