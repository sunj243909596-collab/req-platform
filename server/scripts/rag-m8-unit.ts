/** M8：LLM 重排 JSON 解析 */
import { parseRankedIds } from "../src/services/llm-rerank.service.ts";

const ids = parseRankedIds(
  '说明如下 {"rankedIds":[12, 5, 99, 5]} 结束',
  [1, 5, 12, 20],
  3
);

if (ids.join(",") !== "12,5") {
  console.error("parse failed", ids);
  process.exit(1);
}

const empty = parseRankedIds("not json", [1], 2);
if (empty.length !== 0) {
  process.exit(2);
}

console.log("ok");
