/** RAG 回归：重排/去重后必须保留 chunk/document/path/docType 元数据 */
import { postProcessSearchResults } from "../src/services/rag-search.service.ts";

const chunks = [
  {
    content: "库存表 wm_inventory 的字段说明",
    fileName: "db.md",
    section: "库存",
    similarity: 0.9,
    chunkId: 101,
    documentId: 11,
    relativePath: "01-WMOS核心/db.md",
    docType: "design",
  },
  {
    content: "GSP 温湿度记录要求",
    fileName: "gsp.md",
    section: "温湿度",
    similarity: 0.8,
    chunkId: 202,
    documentId: 22,
    relativePath: "03-GSP/gsp.md",
    docType: "policy",
  },
];

const out = postProcessSearchResults(chunks, 2, 0.58, true);
if (out.length !== 2) {
  console.error("unexpected result length", out);
  process.exit(1);
}

for (const item of out as any[]) {
  if (!item.chunkId || !item.documentId || !item.relativePath || !item.docType) {
    console.error("metadata lost", out);
    process.exit(2);
  }
}

if ((out as any[]).some((item) => item.chunkId === 101 && item.documentId !== 11)) {
  console.error("metadata mismatched", out);
  process.exit(3);
}

console.log("ok");
