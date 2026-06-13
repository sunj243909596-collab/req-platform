#!/usr/bin/env bash
#==============================================================================
# WMS 需求管理平台 — 前后端一键启动（开发模式）
#==============================================================================
#
# 【进入项目目录】
#   cd "/root/WMOS 设计工场/WMS需求管理平台/req-platform"
#
# 【一键启动】
#   ./scripts/dev.sh
#
# 【端口被占用时强制启动】（会先释放 6173 与后端端口）
#   ./scripts/dev.sh --force
#   ./scripts/dev.sh -f
#
# 【查看本说明】
#   ./scripts/dev.sh --help
#
# 【停止服务】
#   按 Ctrl+C（会同时停止前后端）
#   或执行: ./scripts/stop-dev.sh
#
#------------------------------------------------------------------------------
# 默认地址
#------------------------------------------------------------------------------
#   前端页面    http://localhost:6173
#   后端 API    http://localhost:8001  （端口见 server/.env 中 PORT=）
#   健康检查    http://localhost:8001/api/health
#   开发日志    .dev/logs/server.log
#               .dev/logs/client.log
#
#------------------------------------------------------------------------------
# 测试账号
#------------------------------------------------------------------------------
#   admin   / admin123   （管理员）
#   lead    / lead123    （组长）
#   member  / member123  （成员）
#
#------------------------------------------------------------------------------
# 环境变量（可选，覆盖默认）
#------------------------------------------------------------------------------
#   FRONTEND_PORT=6173   前端 Vite 端口
#   BACKEND_PORT=8001    后端端口（未设置时读 server/.env 的 PORT）
#   CORS_ORIGIN=...      后端 CORS，默认 http://localhost:6173
#
#------------------------------------------------------------------------------
# 前置条件
#------------------------------------------------------------------------------
#   1. PostgreSQL 已启动，且 server/.env 中 DATABASE_URL 可连接
#   2. 已在 server、client 目录安装依赖:
#        cd server && pnpm install
#        cd client && pnpm install
#   3. 后端默认使用 8001（8000 常被「闲时补货引擎」占用，勿改代理除非同步 vite）
#
#------------------------------------------------------------------------------
# 说明
#------------------------------------------------------------------------------
#   - 使用 node_modules/.bin/tsx、vite 启动，不经过 pnpm dev 钩子
#   - 前端 /api 请求由 Vite 代理到后端（见 client/vite.config.ts）
#==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"
DEV_DIR="$ROOT/.dev"
LOG_DIR="$DEV_DIR/logs"

FRONTEND_PORT="${FRONTEND_PORT:-6173}"
BACKEND_PORT="${BACKEND_PORT:-}"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    -h|--help)
      sed -n '3,59p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

# 从 server/.env 读取 PORT
if [[ -z "$BACKEND_PORT" && -f "$SERVER_DIR/.env" ]]; then
  BACKEND_PORT="$(grep -E '^PORT=' "$SERVER_DIR/.env" | tail -1 | cut -d= -f2 | tr -d ' "\r' || true)"
fi
BACKEND_PORT="${BACKEND_PORT:-8001}"

log()  { printf '\033[36m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[dev]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[dev]\033[0m %s\n' "$*" >&2; }

port_in_use() {
  local port=$1
  if command -v ss >/dev/null 2>&1; then
    ss -tln 2>/dev/null | grep -q ":${port} "
  else
    lsof -i ":${port}" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

free_port() {
  local port=$1 name=$2
  if port_in_use "$port"; then
    if [[ "$FORCE" -eq 1 ]]; then
      warn "释放端口 ${port}（${name}）..."
      fuser -k "${port}/tcp" 2>/dev/null || true
      sleep 1
    else
      err "端口 ${port}（${name}）已被占用。使用 --force 强制释放，或先执行 ./scripts/stop-dev.sh"
      exit 1
    fi
  fi
}

check_bin() {
  local dir=$1 name=$2
  if [[ ! -x "$dir/node_modules/.bin/$name" ]]; then
    err "未找到 $dir/node_modules/.bin/$name，请先在 $dir 目录执行依赖安装（pnpm install 或 npm install）"
    exit 1
  fi
}

wait_health() {
  local url=$1 label=$2 max=${3:-45}
  local i=1
  while (( i <= max )); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "${label} 已就绪"
      return 0
    fi
    sleep 1
    (( i++ )) || true
  done
  err "${label} 启动超时: ${url}"
  return 1
}

cleanup() {
  log "正在停止服务..."
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${CLIENT_PID:-}" ]] && kill "$CLIENT_PID" 2>/dev/null || true
  # tsx watch / vite 可能产生子进程
  pkill -P "${SERVER_PID:-}" 2>/dev/null || true
  pkill -P "${CLIENT_PID:-}" 2>/dev/null || true
  rm -f "$DEV_DIR/server.pid" "$DEV_DIR/client.pid"
}
trap cleanup EXIT INT TERM

mkdir -p "$LOG_DIR"
check_bin "$SERVER_DIR" tsx
check_bin "$CLIENT_DIR" vite

free_port "$BACKEND_PORT" "后端"
free_port "$FRONTEND_PORT" "前端"

# 8000 常被其他项目占用，仅提示
if port_in_use 8000 && [[ "$BACKEND_PORT" != "8000" ]]; then
  warn "注意: 8000 端口已被其他服务占用（本项目的后端使用 ${BACKEND_PORT}）"
fi

export PORT="$BACKEND_PORT"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:${FRONTEND_PORT}}"

log "启动后端 (PORT=${BACKEND_PORT})..."
(
  cd "$SERVER_DIR"
  exec ./node_modules/.bin/tsx watch src/index.ts
) >>"$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$DEV_DIR/server.pid"

if ! wait_health "http://127.0.0.1:${BACKEND_PORT}/api/health" "后端"; then
  err "后端日志: $LOG_DIR/server.log"
  tail -20 "$LOG_DIR/server.log" >&2 || true
  exit 1
fi

log "启动前端 (PORT=${FRONTEND_PORT})..."
(
  cd "$CLIENT_DIR"
  exec ./node_modules/.bin/vite --port "$FRONTEND_PORT" --strictPort
) >>"$LOG_DIR/client.log" 2>&1 &
CLIENT_PID=$!
echo "$CLIENT_PID" >"$DEV_DIR/client.pid"

if ! wait_health "http://127.0.0.1:${FRONTEND_PORT}/" "前端"; then
  err "前端日志: $LOG_DIR/client.log"
  tail -20 "$LOG_DIR/client.log" >&2 || true
  exit 1
fi

echo ""
log "=========================================="
log "  前端  http://localhost:${FRONTEND_PORT}"
log "  后端  http://localhost:${BACKEND_PORT}"
log "  健康  http://localhost:${BACKEND_PORT}/api/health"
log "  日志  ${LOG_DIR}/"
log "  账号  admin / admin123"
log "=========================================="
log "按 Ctrl+C 停止前后端"
echo ""

# 前台跟随日志（可选：tail -f 两个日志）
wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || wait
