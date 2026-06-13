/**
 * 为已有分块回填 search_vector（迁移后或历史数据）
 * 用法: cd server && npx tsx scripts/kb-backfill-search-vector.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.$executeRawUnsafe(`
    UPDATE "KnowledgeChunk"
    SET search_vector = to_tsvector('simple', COALESCE(content, ''))
    WHERE search_vector IS NULL OR search_vector = ''::tsvector
  `);
  console.log(JSON.stringify({ ok: true, updated: Number(r) }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
