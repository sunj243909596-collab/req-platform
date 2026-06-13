#!/usr/bin/env bash
# 回填 KnowledgeChunk.search_vector（全文检索索引）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER="$ROOT/server"
cd "$SERVER"

if [[ -f prisma/migrations/20260524120000_add_chunk_search_vector/migration.sql ]]; then
  echo "Applying search_vector migration SQL..."
  npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260524120000_add_chunk_search_vector/migration.sql 2>/dev/null \
    || psql "$DATABASE_URL" -f prisma/migrations/20260524120000_add_chunk_search_vector/migration.sql 2>/dev/null \
    || echo "（请手动执行 migration SQL 或 prisma migrate deploy）"
fi

./node_modules/.bin/tsx scripts/kb-backfill-search-vector.ts
