import { rebuildRequirementKb } from "../src/services/requirement-indexer.service";

(async () => {
  const r = await rebuildRequirementKb();
  console.log("result:", r);
})();
