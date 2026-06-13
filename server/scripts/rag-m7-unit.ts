/** M7：关键词分词与分数归一化 */
import {
  tokenizeSearchQuery,
  latinTsQueryText,
  normalizeKeywordScore,
  minKeywordHits,
} from "../src/services/keyword-search.util.ts";

const tokens = tokenizeSearchQuery("入库单 FACILITY 验收流程");
if (!tokens.includes("facility") && !tokens.some((t) => t.includes("facility"))) {
  console.error("tokenize failed", tokens);
  process.exit(1);
}
if (minKeywordHits(tokens.length) < 1) {
  process.exit(2);
}

const ts = latinTsQueryText(tokens);
if (!ts.includes("facility")) {
  console.error("latin ts failed", ts);
  process.exit(3);
}

const norm = normalizeKeywordScore(0.2);
if (norm < 0.38 || norm > 0.72) {
  console.error("normalize failed", norm);
  process.exit(4);
}

console.log("ok");
