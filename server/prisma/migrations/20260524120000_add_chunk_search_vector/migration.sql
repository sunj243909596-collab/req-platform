-- 知识库分块全文检索：tsvector + GIN（配合关键词排序召回）
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE "KnowledgeChunk"
SET search_vector = to_tsvector('simple', COALESCE(content, ''))
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_chunk_search_vector_gin
  ON "KnowledgeChunk" USING GIN (search_vector);
