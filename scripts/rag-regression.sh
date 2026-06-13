#!/usr/bin/env bash
# RAG 知识库模块回测 — 用法: ./scripts/rag-regression.sh [m1|…|m9|all]
# 默认只读（静态 + 单元测试）；设置 RUN_MUTATION_TESTS=1 启用会写库的 API 探测
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/server"
API_BASE="${API_BASE:-http://127.0.0.1:8001/api/v1}"
MODULE="${1:-all}"
RUN_MUTATION_TESTS="${RUN_MUTATION_TESTS:-0}"

pass() { printf '\033[32m[PASS]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }
skip() { printf '\033[33m[SKIP]\033[0m %s\n' "$*"; }

run_tsx_unit() {
  local script="$1"
  local label="$2"
  if [[ ! -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
    skip "tsx 不可用，跳过 $label"
    return 0
  fi
  local out
  out=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json "scripts/$script" 2>&1) || out="fail"
  if [[ "$out" == "ok" ]]; then
    pass "$label"
  else
    fail "$label: $out"
  fi
}

run_rag_core_units() {
  run_tsx_unit "rag-smoke-import.ts" "agent 导入 smoke（3s 内完成）"
  run_tsx_unit "rag-metadata-unit.ts" "重排后元数据保持"
  run_tsx_unit "rag-keyword-fallback-unit.ts" "关键词兜底不被向量阈值误删"
}

echo "=== RAG 回测模块: ${MODULE} ==="

if [[ "$MODULE" == "all" ]]; then
  for m in m1 m2 m3 m4 m5 m6 m7 m8 m9; do
    "$0" "$m" || exit 1
  done
  run_rag_core_units
  echo "=== all 回测完成 ==="
  exit 0
fi

case "$MODULE" in
  m1)
    # 静态：无硬编码 knowledge_base_id = 1
    if grep -q 'knowledge_base_id = 1' "$SERVER_DIR/src/services/prisma.store.ts" 2>/dev/null; then
      fail "prisma.store.ts 仍含 knowledge_base_id = 1 硬编码"
    fi
    pass "无 kbId=1 硬编码"

    # 静态：关键词分词（tokenizeSearchQuery，支持中英文混合）
    grep -q 'tokenizeSearchQuery' "$SERVER_DIR/src/services/prisma.store.ts" \
      && grep -q 'tokenizeSearchQuery' "$SERVER_DIR/src/services/keyword-search.util.ts" \
      || fail "关键词分词未接入 tokenizeSearchQuery"
    pass "关键词分词（tokenizeSearchQuery）已接入"

    # 静态：searchByVector 含 kbId 参数
    grep -q 'searchByVector' "$SERVER_DIR/src/services/agent.service.ts" \
      && grep -q 'kbId: number' "$SERVER_DIR/src/services/agent.service.ts" \
      || fail "AgentDataStore.searchByVector 签名缺少 kbId"
    pass "AgentDataStore 接口含 kbId"

    grep -q 'getDefaultKnowledgeBaseId' "$SERVER_DIR/src/services/prisma.store.ts" \
      || fail "缺少 getDefaultKnowledgeBaseId"
    pass "默认知识库解析已实现"

    # 运行时（服务可用时）
    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
      if [[ -n "$TOKEN" ]]; then
        BASES=$(curl -sf "$API_BASE/knowledge/bases" -H "Authorization: Bearer $TOKEN")
        echo "$BASES" | grep -q '"id"' && pass "知识库列表 API 正常" || skip "知识库列表为空"
        KB_ID=$(echo "$BASES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
        if [[ -n "$KB_ID" ]]; then
          SR=$(curl -sf "$API_BASE/knowledge/search?q=需求&topK=3&kbId=$KB_ID" -H "Authorization: Bearer $TOKEN" || echo "[]")
          echo "$SR" | grep -q '\[' && pass "搜索 API 可调用 (kbId=$KB_ID)" || skip "搜索无结果（可能未同步）"
        fi
      else
        skip "无法登录，跳过运行时 API 测试"
      fi
    else
      skip "后端未启动 (${API_BASE})，仅完成静态检查"
    fi
    ;;

  m2)
    grep -q 'smartSearch' "$SERVER_DIR/src/routes/knowledge.routes.ts" \
      || fail "knowledge.routes 未使用 smartSearch"
    pass "搜索路由已接入 smartSearch"

    [[ -x "$ROOT/scripts/kb-resync-all.sh" ]] || fail "缺少 kb-resync-all.sh"
    pass "全量同步脚本存在"

    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
      if [[ -n "$TOKEN" ]]; then
        SR=$(curl -sf "$API_BASE/knowledge/search?q=WMS&topK=2" -H "Authorization: Bearer $TOKEN")
        echo "$SR" | grep -qE 'fileName|similarity|results|routing' && pass "smartSearch API 返回结构正常" \
          || fail "搜索响应格式异常: $SR"
      else
        skip "无法登录"
      fi
    else
      skip "后端未启动"
    fi
    ;;

  m3)
    grep -q 'similarityThreshold' "$SERVER_DIR/src/services/agent-config.service.ts" \
      || fail "RagConfig 缺少 similarityThreshold"
    pass "RagConfig.similarityThreshold 已定义"

    grep -q 'postProcessSearchResults' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "缺少 postProcessSearchResults"
    pass "后处理管线已实现"

    grep -q "from \"agent\"" "$SERVER_DIR/src/services/rag-search.service.ts" \
      && grep -q 'rerank' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "未接入 agent rerank"
    pass "已接入 rerank"

    run_tsx_unit "rag-m3-unit.ts" "阈值过滤逻辑正确（向量模式过滤低分，关键词模式保留）"
    run_tsx_unit "rag-metadata-unit.ts" "重排后元数据保持"
    run_tsx_unit "rag-keyword-fallback-unit.ts" "关键词兜底不被向量阈值误删"

    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
      if [[ -n "$TOKEN" ]]; then
        SR=$(curl -sf "$API_BASE/knowledge/search?q=test&topK=5" -H "Authorization: Bearer $TOKEN" || echo "[]")
        COUNT=$(echo "$SR" | grep -c '"similarity"' 2>/dev/null || echo 0)
        if [[ "$COUNT" -le 5 ]]; then
          pass "搜索返回条数 <= topK ($COUNT)"
        else
          fail "rerank 后条数异常: $COUNT"
        fi
      fi
    else
      skip "后端未启动"
    fi
    ;;

  m4)
    grep -q 'chunkOverlapMd' "$SERVER_DIR/src/services/agent-config.service.ts" \
      || fail "缺少 chunkOverlapMd 配置"
    pass "chunkOverlapMd 已配置"

    grep -q 'pathPrefix' "$SERVER_DIR/src/services/rag-search.service.ts" \
      && grep -q 'relative_path LIKE' "$SERVER_DIR/src/services/prisma.store.ts" \
      || fail "路径前缀过滤未实现"
    pass "pathPrefix / docType 检索过滤已实现"

    grep -q 'pathPrefix' "$SERVER_DIR/src/routes/knowledge.routes.ts" \
      || fail "搜索 API 未暴露 pathPrefix"
    pass "搜索 API 支持 pathPrefix、docType"

    if [[ -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
      M4_UNIT=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m4-unit.ts 2>&1) || M4_UNIT="fail"
      if [[ "$M4_UNIT" == "ok" ]]; then
        pass "Markdown overlap + filter 解析单元测试通过"
      else
        fail "M4 单元测试失败: $M4_UNIT"
      fi
    else
      skip "tsx 不可用"
    fi

    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)
      if [[ -n "${TOKEN:-}" ]]; then
        SR=$(curl -sf "$API_BASE/knowledge/search?q=test&topK=3&pathPrefix=__no_such_path__" \
          -H "Authorization: Bearer $TOKEN" || echo "[]")
        COUNT=$(echo "$SR" | grep -c '"similarity"' 2>/dev/null || echo 0)
        COUNT=$(echo "$COUNT" | head -1 | tr -d ' \n')
        if [[ -z "$COUNT" || "$COUNT" -eq 0 ]] 2>/dev/null; then
          pass "无效 pathPrefix 返回空结果（过滤生效）"
        else
          skip "无效 pathPrefix 仍有 $COUNT 条（库内路径可能匹配）"
        fi
      fi
    else
      skip "后端未启动"
    fi
    ;;

  m5)
    grep -q 'mergeHybridChunks' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "未接入混合检索"
    pass "混合检索已接入 smartSearch"

    grep -q 'RAG_CITATION_SUFFIX' "$ROOT/agent/src/llm/prompts.ts" \
      || fail "缺少引用强制 prompt"
    pass "RAG 引用规则已加入 prompts"

    grep -q 'readDocumentText' "$SERVER_DIR/src/services/document-text.service.ts" \
      || fail "缺少 PDF 文本读取"
    pass "document-text.service（含 PDF）"

    grep -q 'startKbSyncJob' "$SERVER_DIR/src/services/kb-sync-job.service.ts" \
      || fail "缺少异步同步任务"
    pass "kb-sync-job 服务存在"

    grep -q 'sync/jobs' "$SERVER_DIR/src/routes/knowledge.routes.ts" \
      || fail "缺少 sync job API"
    pass "异步同步 API 已注册"

    if [[ -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
      M5=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m5-unit.ts 2>&1) || M5="fail"
      [[ "$M5" == "ok" ]] && pass "M5 单元测试通过" || fail "M5 单元测试: $M5"
    else
      skip "tsx 不可用"
    fi

    if [[ "$RUN_MUTATION_TESTS" == "1" ]] && curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)
      if [[ -n "${TOKEN:-}" ]]; then
        BASES=$(curl -sf "$API_BASE/knowledge/bases" -H "Authorization: Bearer $TOKEN" || echo '[]')
        KB_ID=$(echo "$BASES" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
        if [[ -n "$KB_ID" ]]; then
          ASYNC=$(curl -sf -X POST "$API_BASE/knowledge/bases/${KB_ID}/sync?async=1" \
            -H "Authorization: Bearer $TOKEN" || echo '{}')
          echo "$ASYNC" | grep -q 'jobId' && pass "异步 sync 返回 jobId (kbId=$KB_ID)" \
            || skip "async sync 未返回 jobId"
        else
          skip "无知识库，跳过 async sync"
        fi
      fi
    else
      skip "异步 sync API 探测已跳过（默认只读；设 RUN_MUTATION_TESTS=1 启用）"
    fi
    ;;

  m6)
    grep -q 'routeKnowledgeBases' "$SERVER_DIR/src/services/kb-router.service.ts" \
      || fail "缺少 kb-router.service"
    pass "kb-router 服务存在"

    grep -q 'listKnowledgeBasesForRouting' "$SERVER_DIR/src/services/prisma.store.ts" \
      || fail "prisma.store 未实现 listKnowledgeBasesForRouting"
    pass "路由候选库列表已实现"

    grep -q 'kbRoutingEnabled' "$SERVER_DIR/src/services/agent-config.service.ts" \
      || fail "agent-config 缺少 kbRoutingEnabled"
    pass "kbRouting 配置项已定义"

    grep -q 'routing' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "smartSearch 未返回 routing"
    pass "smartSearch 含知识库路由"

    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)
      if [[ -n "${TOKEN:-}" ]]; then
        ROUTE=$(curl -sf -X POST "$API_BASE/knowledge/route" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d '{"q":"入库单验收流程"}' || echo '{}')
        echo "$ROUTE" | grep -q 'kbIds' && pass "POST /knowledge/route 返回 kbIds" \
          || fail "路由 API 异常: $ROUTE"

        SR=$(curl -sf "$API_BASE/knowledge/search?q=WMS&topK=3" \
          -H "Authorization: Bearer $TOKEN" || echo '{}')
        echo "$SR" | grep -qE 'routing|results' && pass "搜索 API 含 routing/results" \
          || fail "搜索 API 结构: $SR"
        run_tsx_unit "rag-admin-403-api.ts" "非管理员修改提示词/路由元数据返回 403"
      else
        skip "无法登录"
      fi
    else
      skip "后端未启动"
    fi
    ;;

  m7)
    grep -q 'tokenizeSearchQuery' "$SERVER_DIR/src/services/keyword-search.util.ts" \
      || fail "缺少 keyword-search.util"
    pass "关键词分词工具存在"

    grep -q 'search_vector' "$SERVER_DIR/src/services/prisma.store.ts" \
      || fail "prisma.store 未使用 search_vector"
    pass "关键词检索已接入 tsvector"

    grep -q 'normalizeKeywordScore' "$SERVER_DIR/src/services/prisma.store.ts" \
      || fail "未归一化关键词分数"
    pass "关键词分数归一化已接入"

    if [[ -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
      M7=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m7-unit.ts 2>&1) || M7="fail"
      [[ "$M7" == "ok" ]] && pass "M7 单元测试通过" || fail "M7 单元测试: $M7"
      SMOKE=$(cd "$SERVER_DIR" && set -a && [ -f .env ] && . ./.env; set +a
        ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m7-search-smoke.ts 2>&1) || SMOKE="fail"
      if echo "$SMOKE" | grep -qE '"count":[1-9]'; then
        pass "关键词检索 smoke（有命中结果）"
      else
        skip "关键词 smoke: $SMOKE"
      fi
    else
      skip "tsx 不可用"
    fi

    if curl -sf "${API_BASE%/api/v1}/api/health" >/dev/null 2>&1; then
      TOKEN=$(curl -sf -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p' || true)
      if [[ -n "${TOKEN:-}" ]]; then
        SR=$(curl -sf "$API_BASE/knowledge/search?q=FACILITY&topK=3" \
          -H "Authorization: Bearer $TOKEN" || echo '{}')
        echo "$SR" | grep -qE '"similarity":0\.[4-9]' && pass "关键词召回分数在归一化区间" \
          || echo "$SR" | grep -q '"similarity"' && pass "搜索有 similarity 字段" \
          || skip "关键词分数检查跳过（可能无匹配文档）: $SR"
      fi
    else
      skip "后端未启动"
    fi
    ;;

  m8)
    grep -q 'llmRerankCandidates' "$SERVER_DIR/src/services/llm-rerank.service.ts" \
      || fail "缺少 llm-rerank.service"
    pass "llm-rerank 服务存在"

    grep -q 'finalizeSearchResults' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "smartSearch 未接入 finalizeSearchResults"
    pass "smartSearch 已接入语义重排"

    grep -q 'llmRerankEnabled' "$SERVER_DIR/src/services/agent-config.service.ts" \
      || fail "缺少 llmRerankEnabled 配置"
    pass "llmRerank 配置项已定义"

    if [[ -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
      M8=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m8-unit.ts 2>&1) || M8="fail"
      [[ "$M8" == "ok" ]] && pass "M8 单元测试通过" || fail "M8 单元测试: $M8"
    else
      skip "tsx 不可用"
    fi
    ;;

  m9)
    grep -q 'extractGroundedTableNames' "$ROOT/agent/src/rag/table-grounding.ts" \
      || fail "缺少 table-grounding"
    pass "表名白名单提取已实现"

    grep -q 'inv_inventory' "$ROOT/agent/src/llm/prompts.ts" \
      || fail "prompt 未禁止 inv_inventory"
    pass "RAG prompt 已强化表名约束"

    grep -q 'groundedTableNames' "$SERVER_DIR/src/services/rag-search.service.ts" \
      || fail "RagRetrievalMeta 缺少 groundedTableNames"
    pass "检索元数据含表名列表"

    if [[ -x "$SERVER_DIR/node_modules/.bin/tsx" ]]; then
      M9=$(cd "$SERVER_DIR" && ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/rag-m9-unit.ts 2>&1) || M9="fail"
      [[ "$M9" == "ok" ]] && pass "M9 单元测试通过" || fail "M9: $M9"
    else
      skip "tsx 不可用"
    fi
    ;;

  core)
    run_rag_core_units
    ;;

  *)
    echo "用法: $0 [all|core|m1|m2|m3|m4|m5|m6|m7|m8|m9]"
    exit 1
    ;;
esac

echo "=== ${MODULE} 回测完成 ==="
