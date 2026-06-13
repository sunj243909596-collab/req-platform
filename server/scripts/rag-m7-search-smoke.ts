import { prismaStore } from "../src/services/prisma.store.ts";

async function main() {
  const kbId = await prismaStore.getDefaultKnowledgeBaseId();
  const rows = await prismaStore.searchKnowledgeBase("FACILITY", 3, kbId);
  console.log(
    JSON.stringify({
      kbId,
      count: rows.length,
      samples: rows.map((r) => ({
        file: r.fileName,
        similarity: r.similarity,
      })),
    })
  );
  if (rows.length === 0) process.exit(2);
  if (rows[0].similarity < 0.38) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
