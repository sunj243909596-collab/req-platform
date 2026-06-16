#!/usr/bin/env bash
#==============================================================================
# 生产数据库迁移：prisma migrate deploy
#==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$ROOT/server"

log()  { printf '\033[36m[migrate]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[migrate]\033[0m %s\n' "$*" >&2; }

if [[ ! -f "$SERVER_DIR/.env" ]]; then
  err "未找到 server/.env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source <(grep -E '^[A-Z_]+=' "$SERVER_DIR/.env" | sed 's/\r$//')
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  err "server/.env 中缺少 DATABASE_URL"
  exit 1
fi

log "检查数据库连通性..."
if command -v psql >/dev/null 2>&1; then
  if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    err "无法连接数据库，请检查 DATABASE_URL 与 PostgreSQL 服务"
    exit 1
  fi
else
  log "未安装 psql，跳过连通性检查"
fi

log "执行 prisma migrate deploy..."
(
  cd "$SERVER_DIR"
  pnpm exec prisma generate
  pnpm exec prisma migrate deploy
)

log "迁移完成"
