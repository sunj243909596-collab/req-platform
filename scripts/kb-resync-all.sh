#!/usr/bin/env bash
# 对所有已启用的知识库执行全量同步（需配置 Embedding API Key）
# 用法:
#   export TOKEN="<jwt>"   # 或脚本内自动登录
#   ./scripts/kb-resync-all.sh

set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:8001/api/v1}"

if [[ -z "${TOKEN:-}" ]]; then
  TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' \
    | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
fi

if [[ -z "$TOKEN" ]]; then
  echo "[kb-resync] 登录失败，请设置 TOKEN 或启动后端" >&2
  exit 1
fi

BASES_JSON=$(curl -sf "$API_BASE/knowledge/bases" -H "Authorization: Bearer $TOKEN")
# 提取 enabled 库的 id（简单解析）
IDS=$(echo "$BASES_JSON" | grep -o '"id":[0-9]*' | sed 's/"id"://' | sort -u)

if [[ -z "$IDS" ]]; then
  echo "[kb-resync] 无知识库记录"
  exit 0
fi

echo "[kb-resync] 开始同步..."
for id in $IDS; do
  echo "[kb-resync] POST /knowledge/bases/${id}/sync"
  RESP=$(curl -sf -X POST "$API_BASE/knowledge/bases/${id}/sync" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" || echo '{"ok":false}')
  echo "  -> $RESP"
done

echo "[kb-resync] 完成。若 documents/chunks 为 0，请检查 basePath 与 Embedding 配置。"
