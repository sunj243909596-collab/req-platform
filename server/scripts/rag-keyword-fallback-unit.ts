/** RAG 回归：高分向量命中存在时，关键词兜底结果也不能被向量阈值误删 */
import { finalizeSearchResults } from "../src/services/rag-search.service.ts";

const chunks = [
  {
    content: "语义命中的库存设计说明",
    fileName: "vector.md",
    similarity: 0.8,
    chunkId: 1,
    documentId: 1,
    source: "vector",
  },
  {
    content: "关键词精确命中的 WM_INVENTORY 字段",
    fileName: "keyword.md",
    similarity: 0.3,
    chunkId: 2,
    documentId: 2,
    source: "keyword",
  },
];

const { results } = await finalizeSearchResults("WM_INVENTORY 字段", chunks as any, 5, true, 0.58);
if (!results.some((r: any) => r.chunkId === 2 || r.fileName === "keyword.md")) {
  console.error("keyword fallback was filtered out", results);
  process.exit(1);
}

console.log("ok");
