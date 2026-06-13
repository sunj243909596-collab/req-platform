-- ============================================================
--  RAG 知识库性能诊断脚本
--  目的：量化当前全表扫描耗时 + 分块现状，为 Phase A 修复提供基线数据
--  用法：psql $DATABASE_URL -f rag-explain-analyze.sql
--  注意：只读 SELECT，不修改任何数据
-- ============================================================

\echo ''
\echo '========================================================'
\echo '  § 1. 总量统计'
\echo '========================================================'

SELECT
  kb.id                                                AS "知识库ID",
  kb.name                                              AS "知识库名称",
  COUNT(DISTINCT kd.id)                                AS "文档数",
  COUNT(kc.id)                                         AS "分块总数",
  SUM(CASE WHEN kc.embedding IS NOT NULL THEN 1 END)   AS "有向量的分块",
  SUM(CASE WHEN kc.embedding IS NULL     THEN 1 END)   AS "缺向量的分块(降级)",
  SUM(CASE WHEN kc.search_vector IS NOT NULL THEN 1 END) AS "有search_vector的分块",
  ROUND(AVG(kc.content_tokens))                        AS "平均chunk大小(tokens)"
FROM "KnowledgeBase"  kb
LEFT JOIN "KnowledgeDocument" kd ON kd.knowledge_base_id = kb.id AND kd.is_deleted = false
LEFT JOIN "KnowledgeChunk"    kc ON kc.document_id = kd.id
GROUP BY kb.id, kb.name
ORDER BY kb.id;

\echo ''
\echo '========================================================'
\echo '  § 2. 索引现状'
\echo '========================================================'

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('KnowledgeChunk', 'Requirement')
ORDER BY tablename, indexname;

\echo ''
\echo '========================================================'
\echo '  § 3. 向量搜索执行计划 (EXPLAIN ANALYZE)'
\echo '  复现 searchByVector 的实际 SQL，使用随机 1536 维零向量作为输入'
\echo '  注意：零向量仅用于触发执行路径，不影响执行计划的顺序扫描判断'
\echo '========================================================'

-- 构造一个 1536 维的零向量（仅为触发执行路径，不影响计划形状）
\set QUIET on

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
  kc.id                                 AS chunk_id,
  kc.document_id,
  kc.content,
  kd.file_name,
  kd.relative_path,
  kd.doc_type,
  kc.metadata->>'headingPath'           AS section,
  1 - (kc.embedding <=> ('[' ||
    array_to_string(array_fill(0::float4, ARRAY[1536]), ',')
    || ']')::vector) AS similarity
FROM "KnowledgeChunk" kc
JOIN "KnowledgeDocument" kd ON kc.document_id = kd.id
WHERE kc.embedding IS NOT NULL
  AND kd.knowledge_base_id = (SELECT id FROM "KnowledgeBase" LIMIT 1)
ORDER BY kc.embedding <=> ('[' ||
    array_to_string(array_fill(0::float4, ARRAY[1536]), ',')
    || ']')::vector
LIMIT 15;

\echo ''
\echo '========================================================'
\echo '  § 4. 关键词搜索执行计划 (EXPLAIN ANALYZE)'
\echo '  复现 searchKnowledgeBase 的 LIKE 全扫路径'
\echo '========================================================'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH terms AS (
  SELECT unnest(ARRAY['wms', 'asm', 'lpn']) AS term
),
scored AS (
  SELECT
    kc.id           AS chunk_id,
    kc.document_id,
    kc.content,
    kd.file_name,
    kd.relative_path,
    kd.doc_type,
    kc.metadata->>'headingPath' AS section,
    (
      SELECT COALESCE(SUM(
        CASE WHEN lower(kc.content) LIKE '%' || t.term || '%' THEN 1.0 ELSE 0 END
      ), 0) / GREATEST((SELECT COUNT(*)::float FROM terms), 1.0)
      FROM terms t
    ) AS raw_score,
    (
      SELECT COUNT(*)::int FROM terms t
      WHERE lower(kc.content) LIKE '%' || t.term || '%'
    ) AS hit_count
  FROM "KnowledgeChunk" kc
  JOIN "KnowledgeDocument" kd ON kc.document_id = kd.id
  WHERE kd.knowledge_base_id = (SELECT id FROM "KnowledgeBase" LIMIT 1)
)
SELECT chunk_id, document_id, content, file_name, relative_path, doc_type, section, raw_score
FROM scored
WHERE hit_count >= 1
ORDER BY raw_score DESC
LIMIT 15;

\echo ''
\echo '========================================================'
\echo '  § 5. 向量搜索 vs 关键词搜索 单次耗时对比（pg_stat_statements）'
\echo '  若 pg_stat_statements 未启用则此节返回空'
\echo '========================================================'

SELECT
  LEFT(query, 80)                             AS "SQL摘要",
  calls                                       AS "调用次数",
  ROUND((total_exec_time / calls)::numeric, 2) AS "平均耗时ms",
  ROUND(total_exec_time::numeric, 2)          AS "累计耗时ms",
  rows / calls                                AS "平均返回行"
FROM pg_stat_statements
WHERE query ILIKE '%KnowledgeChunk%'
  AND query ILIKE '%embedding%'
ORDER BY total_exec_time DESC
LIMIT 10;

\echo ''
\echo '========================================================'
\echo '  § 6. 表大小 & 顺序扫描次数'
\echo '========================================================'

SELECT
  relname                                                         AS "表名",
  pg_size_pretty(pg_total_relation_size(oid))                     AS "总大小(含索引)",
  pg_size_pretty(pg_relation_size(oid))                           AS "数据大小",
  seq_scan                                                        AS "顺序扫描次数",
  idx_scan                                                        AS "索引扫描次数",
  n_live_tup                                                      AS "估计行数"
FROM pg_stat_user_tables
WHERE relname IN ('KnowledgeChunk', 'KnowledgeDocument', 'KnowledgeBase', 'Requirement')
ORDER BY relname;

\echo ''
\echo '========================================================'
\echo '  § 7. GIN 索引使用率（search_vector 是否被命中）'
\echo '========================================================'

SELECT
  indexrelname                AS "索引名",
  idx_scan                    AS "扫描次数",
  idx_tup_read                AS "读取元组数",
  idx_tup_fetch               AS "获取元组数"
FROM pg_stat_user_indexes
WHERE relname = 'KnowledgeChunk'
ORDER BY indexrelname;

\echo ''
\echo '诊断完成。关键观察点：'
\echo '  - § 3 执行计划中出现 "Seq Scan" = 全表扫描（无向量索引）'
\echo '  - § 4 执行计划中出现多次 "Seq Scan" = LIKE 未命中 GIN'
\echo '  - § 7 GIN 索引 idx_scan=0 = search_vector 从未被查询用到'
\echo '  - § 2 无 hnsw/ivfflat 索引 = 确认 C1 缺陷'
