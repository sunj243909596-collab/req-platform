#!/usr/bin/env bash
# =============================================================================
# Regenerate server/prisma/schema.sql from schema.prisma (single source of truth)
# =============================================================================
#
# Purpose:
#   Rebuild the consolidated DDL snapshot (server/prisma/schema.sql) so it
#   matches server/prisma/schema.prisma (48 models).
#
# Method:
#   1. Run `prisma migrate diff --from-empty --to-schema-datamodel` to emit DDL
#      for the current schema.prisma state (PascalCase, includes 48 tables,
#      53 indexes, 43 FK constraints, vector(1024) embeddings).
#   2. Prepend the standard header (extensions + metadata).
#   3. Append preserved COMMENT ON statements (from legacy schema) translated
#      to PascalCase quoted identifiers.
#
# Why this matters:
#   Without this script, schema.sql can drift from schema.prisma, causing
#   cold-start (`psql -f schema.sql`) to produce a database incompatible with
#   the running application.
#
# Usage:
#   bash server/scripts/regenerate-schema-sql.sh
#   # → rewrites server/prisma/schema.sql
#
# Prerequisites:
#   - pnpm install (or node_modules with prisma CLI)
#   - Run from project root
#
# Verification:
#   bash scripts/check-schema-sync.sh    # ensures migrations + schema.sql agree
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
SCHEMA_SQL="$SERVER_DIR/prisma/schema.sql"
SCHEMA_PRISMA="$SERVER_DIR/prisma/schema.prisma"
LEGACY_COMMENT_FILE="/tmp/req-platform.legacy-comments.txt"

echo "=========================================="
echo "Regenerating schema.sql from schema.prisma"
echo "=========================================="
echo "Project root : $PROJECT_ROOT"
echo "Schema       : $SCHEMA_PRISMA"
echo "Output       : $SCHEMA_SQL"
echo ""

# ----- Step 1: 备份当前 schema.sql 的 COMMENT ON 段落（PascalCase 兼容）-----
echo "[1/4] Extracting COMMENT ON statements from current schema.sql..."
if [ -f "$SCHEMA_SQL" ]; then
  # 提取从 "-- Column / Table Comments" 开始到文件末尾的 COMMENT 行
  awk '
    /^--.*Column.*Table Comments/ { in_comments = 1; next }
    /^-- =====+ End of schema\.sql/ { in_comments = 0 }
    in_comments && /^COMMENT ON/ { print }
  ' "$SCHEMA_SQL" > "$LEGACY_COMMENT_FILE"

  comment_count=$(wc -l < "$LEGACY_COMMENT_FILE" | tr -d ' ')
  echo "  → preserved $comment_count COMMENT lines"
else
  echo "  → no existing schema.sql, skipping comment preservation"
  touch "$LEGACY_COMMENT_FILE"
fi

# ----- Step 2: 用 prisma generate DDL -----
echo "[2/4] Running prisma migrate diff --from-empty --to-schema-datamodel..."
if [ ! -x "$SERVER_DIR/node_modules/.bin/prisma" ]; then
  echo "ERROR: prisma CLI not found at $SERVER_DIR/node_modules/.bin/prisma"
  echo "Run: cd $SERVER_DIR && pnpm install"
  exit 1
fi

DDL_TMP=$(mktemp)
"$SERVER_DIR/node_modules/.bin/prisma" migrate diff \
  --from-empty \
  --to-schema-datamodel "$SCHEMA_PRISMA" \
  --script > "$DDL_TMP" 2>/dev/null

# 去掉 prisma 加的 CreateSchema 行（schema.sql 假设 public schema 已存在）
DDL_BODY=$(sed -E -e '/^-- CreateSchema$/d' -e '/^CREATE SCHEMA IF NOT EXISTS "public";$/d' "$DDL_TMP")
rm -f "$DDL_TMP"

echo "  → generated DDL body"

# ----- Step 3: 组装最终 schema.sql -----
echo "[3/4] Assembling final schema.sql..."

cat > "$SCHEMA_SQL" <<'HEADER'
-- =============================================================================
-- Req Platform — PostgreSQL 15 DDL (snapshot)
-- =============================================================================
-- 本文件是数据库 schema 的快照视图，与 server/prisma/schema.prisma 保持一致。
-- 数据来源：server/prisma/schema.prisma (48 models)
-- 重建方法：bash server/scripts/regenerate-schema-sql.sh
--   （内部调用 prisma migrate diff --from-empty --to-schema-datamodel）
--
-- 使用方式（冷启动快速初始化）：
--   psql "$DATABASE_URL" -f server/prisma/schema.sql
--
-- 完整迁移历史请参考 server/prisma/migrations/ 目录（17 个 migration 链）。
-- Migrations 与 schema.sql 的差异检查：
--   bash scripts/check-schema-sync.sh
--
-- 说明：
--   1. 主键统一使用 SERIAL（PG 默认与 prisma-client-js 兼容）。
--   2. 时间字段使用 TIMESTAMP(3)（毫秒精度，与 Prisma 默认一致）。
--   3. JSON 字段使用 JSONB。
--   4. 向量字段（pgvector）维度：1024，与 Claude embedding 对齐。
--   5. CREATE TABLE 顺序任意：所有 FK 通过 ALTER TABLE ... ADD CONSTRAINT 添加。
--   6. 需提前启用扩展：vector / pg_trgm / uuid-ossp（见下文）。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "vector";     -- pgvector (向量检索)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- 模糊检索 (GIN 索引)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID 生成

-- -----------------------------------------------------------------------------
-- Tables (48 from schema.prisma)
-- -----------------------------------------------------------------------------
HEADER

# 追加 DDL body（去掉空尾行）
echo "$DDL_BODY" >> "$SCHEMA_SQL"

# 追加 COMMENT ON
if [ -s "$LEGACY_COMMENT_FILE" ]; then
  cat >> "$SCHEMA_SQL" <<'COMMENTS_HEADER'

-- -----------------------------------------------------------------------------
-- Column / Table Comments (preserved across regenerations, PascalCase quoted)
-- -----------------------------------------------------------------------------
COMMENTS_HEADER
  cat "$LEGACY_COMMENT_FILE" >> "$SCHEMA_SQL"
fi

# 追加文件结尾
cat >> "$SCHEMA_SQL" <<'FOOTER'

-- =============================================================================
-- End of schema.sql
-- =============================================================================
FOOTER

rm -f "$LEGACY_COMMENT_FILE"

# ----- Step 4: 输出统计 -----
echo "[4/4] Schema.sql regenerated. Statistics:"
echo "  - Lines           : $(wc -l < "$SCHEMA_SQL" | tr -d ' ')"
echo "  - CREATE TABLE    : $(grep -c '^CREATE TABLE' "$SCHEMA_SQL" | tr -d ' ')"
echo "  - CREATE INDEX    : $(grep -cE '^CREATE( UNIQUE)? INDEX' "$SCHEMA_SQL" | tr -d ' ')"
echo "  - ALTER TABLE FK  : $(grep -c '^ALTER TABLE' "$SCHEMA_SQL" | tr -d ' ')"
echo "  - COMMENT ON      : $(grep -c '^COMMENT ON' "$SCHEMA_SQL" | tr -d ' ')"
echo "  - CREATE EXTENSION: $(grep -c '^CREATE EXTENSION' "$SCHEMA_SQL" | tr -d ' ')"
echo ""
echo "✅ Done. Run 'bash scripts/check-schema-sync.sh' to verify migrations agree."
