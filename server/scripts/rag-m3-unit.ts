/** M3 回测：阈值过滤 + rerank（由 rag-regression.sh 调用） */
import { postProcessSearchResults } from "../src/services/rag-search.service.ts";

const low = [{ content: "a", fileName: "f.md", similarity: 0.4, chunkId: 1, documentId: 1 }];
const high = [{ content: "b", fileName: "g.md", similarity: 0.7, chunkId: 2, documentId: 1 }];

const vectorOut = postProcessSearchResults([...low, ...high], 5, 0.58, true);
if (vectorOut.length !== 1 || vectorOut[0].similarity < 0.58) {
  console.error("vector filter failed", vectorOut);
  process.exit(1);
}

const kwOut = postProcessSearchResults(low, 5, 0.58, false);
if (kwOut.length !== 1) {
  console.error("keyword mode failed", kwOut);
  process.exit(2);
}

console.log("ok");
