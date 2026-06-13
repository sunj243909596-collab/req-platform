#!/usr/bin/env bash
# ============================================================
#  RAG 知识库性能基线采集脚本
#  用法：bash scripts/rag-baseline.sh
#  输出：scripts/rag-baseline-YYYYMMDD-HHMMSS.txt
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# --- 数据库连接 (本地 PostgreSQL，与 server/.env 一致) ---
DB_HOST="${PGHOST:-127.0.0.1}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-req_admin}"
DB_PASS="${PGPASSWORD:-req_secret}"
DB_NAME="${PGDATABASE:-req_platform_db}"

export PGPASSWORD="$DB_PASS"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
OUT="$SCRIPT_DIR/rag-baseline-$(date +%Y%m%d-%H%M%S).txt"

echo "=== RAG 知识库性能基线 ===" | tee "$OUT"
echo "时间：$(date)"              | tee -a "$OUT"
echo "DB：$DB_HOST:$DB_PORT/$DB_NAME" | tee -a "$OUT"
echo ""                           | tee -a "$OUT"

# --- 检查 DB 连通性 ---
if ! $PSQL -c "SELECT 1" > /dev/null 2>&1; then
  echo "❌ 无法连接数据库，请确认 docker-compose up 已启动，或调整脚本顶部的 DB 变量" | tee -a "$OUT"
  exit 1
fi
echo "✅ 数据库连接正常" | tee -a "$OUT"
echo ""                  | tee -a "$OUT"

# --- 检查 pgvector 扩展 ---
VECTOR_VER=$($PSQL -tAc "SELECT default_version FROM pg_available_extensions WHERE name='vector'" 2>/dev/null || true)
if [[ -z "$VECTOR_VER" ]]; then
  echo "⚠️  pgvector 扩展不可用（镜像未包含）" | tee -a "$OUT"
else
  INSTALLED=$($PSQL -tAc "SELECT installed_version FROM pg_available_extensions WHERE name='vector'" 2>/dev/null || true)
  echo "pgvector 版本：可用=$VECTOR_VER  已安装=${INSTALLED:-未安装}" | tee -a "$OUT"
fi
echo "" | tee -a "$OUT"

# --- 检查 KnowledgeChunk 表是否存在 ---
TABLE_EXISTS=$($PSQL -tAc "SELECT to_regclass('public.\"KnowledgeChunk\"')" 2>/dev/null || true)
if [[ "$TABLE_EXISTS" == "" || "$TABLE_EXISTS" == "-" ]]; then
  echo "⚠️  KnowledgeChunk 表不存在，可能数据库迁移未完成，跳过分析" | tee -a "$OUT"
  exit 0
fi

# --- 执行主诊断 SQL ---
echo "--- 执行诊断 SQL ---" | tee -a "$OUT"
$PSQL \
  --set=VERBOSITY=default \
  --set=TIMING=on \
  -f "$SCRIPT_DIR/rag-explain-analyze.sql" 2>&1 | tee -a "$OUT"

# --- 快速摘要：从输出中提取关键指标 ---
echo "" | tee -a "$OUT"
echo "=== 快速诊断摘要 ===" | tee -a "$OUT"

# 顺序扫描检测
if grep -q "Seq Scan on" "$OUT"; then
  echo "🔴 发现 Seq Scan（全表扫描）——向量索引或 GIN 索引未生效" | tee -a "$OUT"
  grep "Seq Scan on" "$OUT" | sort -u | tee -a "$OUT"
else
  echo "✅ 未发现明显 Seq Scan" | tee -a "$OUT"
fi

# 执行时间提取
echo "" | tee -a "$OUT"
echo "执行时间（从 EXPLAIN ANALYZE 输出提取）：" | tee -a "$OUT"
grep "Execution Time\|Planning Time" "$OUT" | tee -a "$OUT"

# 分块总数
echo "" | tee -a "$OUT"
echo "注意：详细数据已写入 $OUT" | tee -a "$OUT"
echo "完成。"
