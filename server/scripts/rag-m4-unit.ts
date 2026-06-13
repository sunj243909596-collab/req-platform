/** M4 回测：Markdown overlap + 文档过滤解析 */
import { chunkMarkdown } from "agent";
import { resolveDocumentFilter } from "../src/services/rag-search.service.ts";

// --- chunk overlap ---
const body = "# 章节\n\n" + Array.from({ length: 80 }, (_, i) => `段落${i}：` + "内容。".repeat(20)).join("\n\n");
const chunks = chunkMarkdown(body, 800, 120);
if (chunks.length < 2) {
  console.error("expected multiple md chunks, got", chunks.length);
  process.exit(1);
}
const tail = chunks[0].content.slice(-80);
if (!chunks[1].content.includes(tail.slice(-40))) {
  console.error("second chunk missing overlap from first");
  process.exit(2);
}

// --- filter resolve ---
const f = resolveDocumentFilter(
  { pathPrefix: "设计/" },
  {
    rag: {
      topK: 5,
      contextMaxTokens: 1000,
      chatTemperature: 0.1,
      chunkMaxCharsMd: 3000,
      chunkMaxCharsText: 2000,
      chunkOverlapMd: 200,
      similarityThreshold: 0.58,
      vectorCandidateMultiplier: 3,
      searchDocType: "FSD",
      searchPathPrefix: null,
    },
  } as import("../src/services/agent-config.service.ts").AgentConfigData
);
if (f?.docType !== "FSD" || f?.pathPrefix !== "设计/") {
  console.error("filter merge failed", f);
  process.exit(3);
}

console.log("ok");
