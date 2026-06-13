#!/usr/bin/env bash
#==============================================================================
# WMS 需求管理平台 — 停止 dev.sh 启动的前后端
#==============================================================================
#
# 【用法】
#   cd "/root/WMOS 设计工场/WMS需求管理平台/req-platform"
#   ./scripts/stop-dev.sh
#
# 【作用】
#   - 根据 .dev/server.pid、.dev/client.pid 结束进程
#   - 释放后端端口（server/.env 的 PORT，默认 8001）与前端端口 6173
#
# 【配合启动脚本】
#   启动: ./scripts/dev.sh
#   停止: ./scripts/stop-dev.sh  或 dev 前台运行时 Ctrl+C
#
# 【可选环境变量】
#   FRONTEND_PORT=6173
#   BACKEND_PORT=8001
#==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DIR="$ROOT/.dev"
SERVER_DIR="$ROOT/server"

FRONTEND_PORT="${FRONTEND_PORT:-6173}"
BACKEND_PORT="${BACKEND_PORT:-}"

if [[ -z "$BACKEND_PORT" && -f "$SERVER_DIR/.env" ]]; then
  BACKEND_PORT="$(grep -E '^PORT=' "$SERVER_DIR/.env" | tail -1 | cut -d= -f2 | tr -d ' "\r' || true)"
fi
BACKEND_PORT="${BACKEND_PORT:-8001}"

kill_pid_file() {
  local f=$1
  if [[ -f "$f" ]]; then
    local pid
    pid="$(cat "$f")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      pkill -P "$pid" 2>/dev/null || true
    fi
    rm -f "$f"
  fi
}

echo "[stop] 停止进程..."
kill_pid_file "$DEV_DIR/server.pid"
kill_pid_file "$DEV_DIR/client.pid"

for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  fi
done

echo "[stop] 已释放端口 ${BACKEND_PORT}（后端）、${FRONTEND_PORT}（前端）"
