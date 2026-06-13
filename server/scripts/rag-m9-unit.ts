import { extractGroundedTableNames, buildTableGroundingBlock } from "agent";

const names = extractGroundedTableNames([
  {
    fileName: "WM_INVENTORY.md",
    content: "核心表 `wm_inventory` 与 WM_INVENTORY 相同，勿用 inv_inventory",
  },
]);

if (!names.some((n) => n.toLowerCase().includes("wm_inventory"))) {
  console.error("extract failed", names);
  process.exit(1);
}

const block = buildTableGroundingBlock(names);
if (!block.includes("wm_inventory") && !block.includes("WM_INVENTORY")) {
  console.error("block missing tables");
  process.exit(2);
}
if (!block.includes("inv_inventory")) {
  console.error("block should mention forbidden example");
  process.exit(3);
}

console.log("ok");
