#!/usr/bin/env bash
#==============================================================================
# WMS 需求管理平台 — 生产部署主脚本
#==============================================================================
#
# 用法:
#   ./scripts/deploy.sh [command] [options]
#
# 命令:
#   all              构建 + 迁移 + 重启（日常发布，默认）
#   build            仅构建前后端
#   migrate          仅执行 prisma migrate deploy
#   seed             执行 prisma db seed（首次部署）
#   restart          重启 systemd 服务
#   stop             停止 systemd 服务
#   status           健康检查
#   install          首次完整安装
#   install-systemd  注册 systemd 单元
#   nginx-config     生成 Nginx 站点配置
#   help             显示帮助
#
# 示例:
#   ./scripts/deploy.sh install
#   ./scripts/deploy.sh all
#   sudo ./scripts/deploy.sh nginx-config --domain req.example.com
#
#==============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/server"
CLIENT_DIR="$ROOT/client"
SERVICE_NAME="req-platform"

log()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[deploy]\033[0m %s\n' "$*"; }
err()  { printf '\033[31m[deploy]\033[0m %s\n' "$*" >&2; }

read_env_port() {
  local port=""
  if [[ -f "$SERVER_DIR/.env" ]]; then
    port="$(grep -E '^PORT=' "$SERVER_DIR/.env" | tail -1 | cut -d= -f2 | tr -d ' "\r' || true)"
  fi
  echo "${port:-8001}"
}

cmd_build() {
  "$ROOT/scripts/deploy/build.sh"
}

cmd_migrate() {
  "$ROOT/scripts/deploy/migrate.sh"
}

cmd_seed() {
  (
    cd "$SERVER_DIR"
    pnpm prisma:seed
  )
  warn "默认账号 admin/admin123 — 请立即修改密码"
}

cmd_restart() {
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]] && \
     timeout 3 systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      systemctl restart "$SERVICE_NAME"
      log "已重启 $SERVICE_NAME"
    else
      sudo systemctl restart "$SERVICE_NAME"
      log "已重启 $SERVICE_NAME"
    fi
  else
    warn "未找到 systemd 单元 $SERVICE_NAME，尝试直接启动..."
    local port
    port="$(read_env_port)"
    pkill -f "node dist/server/src/index.js" 2>/dev/null || true
    (
      cd "$SERVER_DIR"
      set -a
      # shellcheck disable=SC1091
      source <(grep -E '^[A-Z_]+=' .env | sed 's/\r$//')
      set +a
      nohup node dist/server/src/index.js >> "$ROOT/.deploy/server.log" 2>&1 &
      echo $! > "$ROOT/.deploy/server.pid"
    )
    log "后端已在后台启动，PID=$(cat "$ROOT/.deploy/server.pid")，端口=$port"
  fi
}

cmd_stop() {
  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]] && \
     timeout 3 systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      systemctl stop "$SERVICE_NAME"
    else
      sudo systemctl stop "$SERVICE_NAME"
    fi
    log "已停止 $SERVICE_NAME"
  elif [[ -f "$ROOT/.deploy/server.pid" ]]; then
    kill "$(cat "$ROOT/.deploy/server.pid")" 2>/dev/null || true
    rm -f "$ROOT/.deploy/server.pid"
    log "已停止后台进程"
  else
    warn "未发现运行中的服务"
  fi
}

cmd_status() {
  local port backend_ok=0 frontend_ok=0
  port="$(read_env_port)"

  if curl -sf --connect-timeout 3 --max-time 5 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
    backend_ok=1
    log "后端 health: ok (http://127.0.0.1:${port}/api/health)"
  else
    err "后端 health: FAIL (http://127.0.0.1:${port}/api/health)"
  fi

  if [[ -f "$CLIENT_DIR/dist/index.html" ]]; then
    frontend_ok=1
    log "前端静态文件: ok ($CLIENT_DIR/dist/index.html)"
  else
    err "前端静态文件: 未构建"
  fi

  if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
    if timeout 3 systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
      log "systemd: active"
    else
      warn "systemd: inactive"
    fi
  elif [[ -f "$ROOT/.deploy/server.pid" ]] && kill -0 "$(cat "$ROOT/.deploy/server.pid")" 2>/dev/null; then
    log "进程: 运行中 (nohup, PID=$(cat "$ROOT/.deploy/server.pid"))"
  else
    warn "未发现 systemd 或 nohup 进程"
  fi

  if (( backend_ok && frontend_ok )); then
    return 0
  fi
  return 1
}

cmd_install_systemd() {
  local deploy_user
  deploy_user="$(whoami)"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --user) deploy_user="$2"; shift 2 ;;
      *) deploy_user="$1"; shift ;;
    esac
  done
  local template="$ROOT/deploy/systemd/req-platform.service.example"
  local target="/etc/systemd/system/${SERVICE_NAME}.service"

  if [[ ! -f "$template" ]]; then
    err "缺少模板: $template"
    exit 1
  fi

  if [[ ! -f "$SERVER_DIR/dist/server/src/index.js" ]]; then
    err "后端未构建，请先执行 ./scripts/deploy.sh build"
    exit 1
  fi

  local node_path
  node_path="$(command -v node)"

  sed \
    -e "s|__APP_ROOT__|$ROOT|g" \
    -e "s|__USER__|$deploy_user|g" \
    "$template" \
    | sed "s|/usr/bin/node|$node_path|g" \
    | sudo tee "$target" >/dev/null

  sudo systemctl daemon-reload
  log "已安装 systemd 单元: $target"
  log "启动: sudo systemctl enable --now $SERVICE_NAME"
}

cmd_nginx_config() {
  local domain="" app_root="$ROOT/client/dist" backend_port=""
  backend_port="$(read_env_port)"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain) domain="$2"; shift 2 ;;
      --root) app_root="$2"; shift 2 ;;
      --port) backend_port="$2"; shift 2 ;;
      *) err "未知参数: $1"; exit 1 ;;
    esac
  done

  if [[ -z "$domain" ]]; then
    err "请指定 --domain，例如: sudo ./scripts/deploy.sh nginx-config --domain req.example.com"
    exit 1
  fi

  local template="$ROOT/deploy/nginx/req-platform.conf.example"
  local target="/etc/nginx/sites-available/${SERVICE_NAME}"

  sed \
    -e "s|__DOMAIN__|$domain|g" \
    -e "s|__ROOT__|$app_root|g" \
    -e "s|__BACKEND_PORT__|$backend_port|g" \
    "$template" \
    | sudo tee "$target" >/dev/null

  sudo ln -sf "$target" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
  sudo nginx -t
  log "Nginx 配置已写入: $target"
  log "重载: sudo systemctl reload nginx"
  log "HTTPS: sudo certbot --nginx -d $domain"
}

cmd_install() {
  mkdir -p "$ROOT/.deploy"
  DEPLOY_USER="${DEPLOY_USER:-$(whoami)}" "$ROOT/scripts/deploy/install.sh"
}

cmd_all() {
  cmd_build
  cmd_migrate
  cmd_restart
  sleep 2
  cmd_status || true
}

show_help() {
  sed -n '5,28p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  local cmd="${1:-all}"
  shift || true

  case "$cmd" in
    build)            cmd_build ;;
    migrate)          cmd_migrate ;;
    seed)             cmd_seed ;;
    restart)          cmd_restart ;;
    stop)             cmd_stop ;;
    status)           cmd_status ;;
    install)          cmd_install ;;
    install-systemd)  cmd_install_systemd "$@" ;;
    nginx-config)     cmd_nginx_config "$@" ;;
    all)              cmd_all ;;
    help|-h|--help)   show_help ;;
    *)
      err "未知命令: $cmd"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
