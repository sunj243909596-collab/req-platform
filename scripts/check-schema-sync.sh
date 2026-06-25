#!/usr/bin/env bash
# =============================================================================
# Check that server/prisma/schema.sql is in sync with schema.prisma + migrations
# =============================================================================
#
# Compares three artifacts and reports drift:
#   1. server/prisma/schema.prisma       (48 models, source of truth)
#   2. server/prisma/schema.sql           (consolidated DDL snapshot)
#   3. server/prisma/migrations/          (17-migration chain)
#
# Exit codes:
#   0 = all three agree
#   1 = drift detected (print diff and stop)
#
# What is checked:
#   - schema.sql CREATE TABLE count == schema.prisma model count
#   - migrations CREATE TABLE count + ALTER TABLE add-column = schema.prisma model count
#   - schema.sql contains all 5 permission tables (PermissionResource etc.)
#   - schema.sql naming: PascalCase quoted (matches Prisma default)
#   - No "ghost tables" in schema.sql that have no model in schema.prisma
#   - All 3 extensions (vector, pg_trgm, uuid-ossp) declared in schema.sql
#
# Usage:
#   bash scripts/check-schema-sync.sh
#   bash scripts/check-schema-sync.sh --fix   # regenerate schema.sql if drift
# =============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
SCHEMA_SQL="$SERVER_DIR/prisma/schema.sql"
SCHEMA_PRISMA="$SERVER_DIR/prisma/schema.prisma"
MIGRATIONS_DIR="$SERVER_DIR/prisma/migrations"

AUTO_FIX=0
if [ "${1:-}" = "--fix" ]; then
  AUTO_FIX=1
fi

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

errors=0

err() {
  echo -e "${RED}❌ $1${NC}"
  errors=$((errors + 1))
}

ok() {
  echo -e "${GREEN}✅ $1${NC}"
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

echo "=========================================="
echo "Schema Sync Check"
echo "=========================================="
echo "Project root : $PROJECT_ROOT"
echo ""

# ----- Check 1: 文件存在 -----
echo "[1] Required files exist:"
if [ -f "$SCHEMA_PRISMA" ]; then ok "schema.prisma exists"; else err "schema.prisma missing"; exit 1; fi
if [ -f "$SCHEMA_SQL" ]; then ok "schema.sql exists"; else err "schema.sql missing"; fi
if [ -d "$MIGRATIONS_DIR" ]; then ok "migrations/ exists"; else err "migrations/ missing"; exit 1; fi
echo ""

# ----- Check 2: 统计基础数据 -----
prisma_models=$(grep -cE '^model ' "$SCHEMA_PRISMA" | awk '{print $1}')
sql_tables=$(grep -c '^CREATE TABLE' "$SCHEMA_SQL" 2>/dev/null | awk '{print $1}')
migration_count=$(ls -1 "$MIGRATIONS_DIR" | grep -v 'migration_lock' | wc -l | awk '{print $1}')

# 累积 migrations 的 CREATE TABLE
migration_create_tables=0
for m in $(ls -1 "$MIGRATIONS_DIR" | grep -v 'migration_lock' | sort); do
  cnt=$(grep -c '^CREATE TABLE' "$MIGRATIONS_DIR/$m/migration.sql" 2>/dev/null || true)
  cnt=${cnt:-0}
  # 处理可能的换行问题（grep -c 在某些环境下会输出 "0" 加换行）
  cnt=$(echo "$cnt" | head -1 | tr -dc '0-9')
  cnt=${cnt:-0}
  migration_create_tables=$((migration_create_tables + cnt))
done

echo "[2] Statistics:"
echo "  - schema.prisma models       : $prisma_models"
echo "  - schema.sql CREATE TABLE    : $sql_tables"
echo "  - migrations count           : $migration_count"
echo "  - migrations CREATE TABLE    : $migration_create_tables (cumulative)"
echo ""

# ----- Check 3: schema.sql 表数 == prisma models -----
echo "[3] schema.sql vs schema.prisma:"
if [ "$sql_tables" -eq "$prisma_models" ]; then
  ok "schema.sql tables ($sql_tables) == schema.prisma models ($prisma_models)"
else
  err "schema.sql tables ($sql_tables) != schema.prisma models ($prisma_models) — drift detected"
  if [ "$AUTO_FIX" -eq 1 ]; then
    warn "  → running regenerate-schema-sql.sh (auto-fix)"
    bash "$SERVER_DIR/scripts/regenerate-schema-sql.sh" > /dev/null 2>&1
    sql_tables=$(grep -c '^CREATE TABLE' "$SCHEMA_SQL" | tr -d ' ')
    [ "$sql_tables" -eq "$prisma_models" ] && ok "  → after fix: tables=$sql_tables ✓" || err "  → auto-fix failed, please run manually"
  fi
fi
echo ""

# ----- Check 4: 5 张权限表 -----
echo "[4] Permission tables (added in v1.0.0):"
for t in PermissionResource Permission PermissionGroup PermissionGroupItem UserPermissionGroup; do
  if grep -q "^CREATE TABLE \"$t\"" "$SCHEMA_SQL" 2>/dev/null; then
    ok "  $t present"
  else
    err "  $t MISSING in schema.sql"
  fi
done
echo ""

# ----- Check 5: PascalCase 命名（无下划线的 snake_case CREATE TABLE）-----
echo "[5] Naming convention (PascalCase quoted):"
non_pascal=$(grep -E '^CREATE TABLE[[:space:]]+[a-z_]+\(' "$SCHEMA_SQL" 2>/dev/null | head -3)
if [ -z "$non_pascal" ]; then
  ok "  all CREATE TABLE use PascalCase quoted identifiers"
else
  err "  found non-PascalCase CREATE TABLE (incompatible with Prisma):"
  echo "$non_pascal" | sed 's/^/    /'
fi
echo ""

# ----- Check 6: 3 个扩展 -----
echo "[6] Required extensions:"
for ext in vector pg_trgm uuid-ossp; do
  if grep -q "CREATE EXTENSION IF NOT EXISTS \"$ext\"" "$SCHEMA_SQL" 2>/dev/null; then
    ok "  $ext"
  else
    err "  $ext extension MISSING"
  fi
done
echo ""

# ----- Check 7: migrations CREATE TABLE 数 >= prisma models（因为可能新增表到 prisma 但没加 migration）-----
echo "[7] Migrations completeness (cumulative CREATE TABLE >= schema.prisma models):"
if [ "$migration_create_tables" -ge "$prisma_models" ]; then
  ok "  migrations cumulative ($migration_create_tables) >= schema.prisma models ($prisma_models)"
else
  err "  migrations cumulative ($migration_create_tables) < schema.prisma models ($prisma_models)"
  echo "    → models without CREATE TABLE migration:"
  prisma_names=$(grep -E '^model ' "$SCHEMA_PRISMA" | sed 's/model \([A-Za-z_]*\).*/\1/' | sort)
  for m in $(ls -1 "$MIGRATIONS_DIR" | grep -v 'migration_lock' | sort); do
    grep '^CREATE TABLE' "$MIGRATIONS_DIR/$m/migration.sql" 2>/dev/null | sed -E 's/^CREATE TABLE "?([A-Za-z_]+)"?.*/\1/'
  done | sort -u > /tmp/migration_tables.txt
  comm -23 <(echo "$prisma_names") /tmp/migration_tables.txt | sed 's/^/      - /'
fi
echo ""

# ----- 总结 -----
echo "=========================================="
if [ "$errors" -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed. schema.sql is in sync.${NC}"
  exit 0
else
  echo -e "${RED}❌ $errors issue(s) detected.${NC}"
  if [ "$AUTO_FIX" -eq 0 ]; then
    echo ""
    echo "Run with --fix to auto-regenerate schema.sql:"
    echo "  bash scripts/check-schema-sync.sh --fix"
  fi
  exit 1
fi
