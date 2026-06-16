#!/usr/bin/env bash
#==============================================================================
# 生产构建：前端 Vite build + 后端 tsc + Prisma Client 生成
#==============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"

log()  { printf '\033[36m[build]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[build]\033[0m %s\n' "$*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "缺少命令: $1"
    exit 1
  fi
}

require_cmd node
require_cmd pnpm

node_major="$(node -p "process.versions.node.split('.')[0]")"
if (( node_major < 20 )); then
  err "需要 Node.js >= 20，当前: $(node -v)"
  exit 1
fi

if [[ ! -f "$SERVER_DIR/.env" ]]; then
  err "未找到 server/.env，请先复制 deploy/env/server.env.production.example"
  exit 1
fi

log "安装 server 依赖..."
(
  cd "$SERVER_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
)

log "生成 Prisma Client..."
(
  cd "$SERVER_DIR"
  pnpm exec prisma generate
)

log "编译后端 TypeScript..."
(
  cd "$SERVER_DIR"
  pnpm build
)

if [[ ! -f "$SERVER_DIR/dist/server/src/index.js" ]]; then
  err "后端构建产物不存在: dist/server/src/index.js"
  exit 1
fi

log "安装 client 依赖..."
(
  cd "$CLIENT_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
)

log "构建前端..."
(
  cd "$CLIENT_DIR"
  pnpm build
)

if [[ ! -f "$CLIENT_DIR/dist/index.html" ]]; then
  err "前端构建产物不存在: client/dist/index.html"
  exit 1
fi

mkdir -p "$SERVER_DIR/uploads"
log "构建完成"
log "  后端入口: $SERVER_DIR/dist/server/src/index.js"
log "  前端目录: $CLIENT_DIR/dist"
