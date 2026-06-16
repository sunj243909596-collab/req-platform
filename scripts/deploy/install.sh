#!/usr/bin/env bash
#==============================================================================
# 首次安装：创建 uploads 目录、注册 systemd、生成 nginx 配置提示
#==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$ROOT/server"
DEPLOY_USER="${DEPLOY_USER:-$(whoami)}"

log()  { printf '\033[36m[install]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[install]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[install]\033[0m %s\n' "$*" >&2; }

if [[ ! -f "$SERVER_DIR/.env" ]]; then
  if [[ -f "$ROOT/deploy/env/server.env.production.example" ]]; then
    cp "$ROOT/deploy/env/server.env.production.example" "$SERVER_DIR/.env"
    warn "已从模板创建 server/.env，请编辑后再继续"
  else
    err "缺少 server/.env"
    exit 1
  fi
fi

chmod 600 "$SERVER_DIR/.env" 2>/dev/null || true
mkdir -p "$SERVER_DIR/uploads"/{kb,manuals,req-docs,test-runs,reg-runs}

log "创建持久化目录: $SERVER_DIR/uploads"

# 构建 + 迁移
"$ROOT/scripts/deploy/build.sh"
"$ROOT/scripts/deploy/migrate.sh"

if [[ "${SKIP_SEED:-}" != "1" ]]; then
  log "执行 seed（初始账号）..."
  (
    cd "$SERVER_DIR"
    pnpm prisma:seed
  )
  warn "默认账号 admin/admin123 — 上线后请立即修改密码"
fi

# systemd
if [[ "${SKIP_SYSTEMD:-}" != "1" ]]; then
  "$ROOT/scripts/deploy.sh" install-systemd --user "$DEPLOY_USER"
fi

echo ""
log "=========================================="
log "  首次安装完成"
log "  项目目录: $ROOT"
log "  下一步:"
log "    1. 编辑 server/.env（JWT_SECRET、CORS_ORIGIN、API Key）"
log "    2. sudo ./scripts/deploy.sh nginx-config --domain <域名>"
log "    3. sudo systemctl enable --now req-platform"
log "    4. ./scripts/deploy.sh status"
log "=========================================="
