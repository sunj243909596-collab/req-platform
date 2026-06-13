-- Change embedding column dimension from 1536 to 1024
-- Reason: switching from OpenAI text-embedding-3-small (1536) to
--         Alibaba dashscope text-embedding-v3 (default 1024) for RAG.
-- All existing rows have NULL / empty embeddings (failed before the fix),
-- so no in-place conversion is needed; we just resize the column.

-- 1) Drop HNSW index on KnowledgeChunk (cannot resize vector column with index)
DROP INDEX IF EXISTS "KnowledgeChunk_embedding_hnsw_idx";

-- 2) Resize both vector columns to 1024 dimensions
ALTER TABLE "KnowledgeChunk" ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE "Requirement"  ALTER COLUMN embedding TYPE vector(1024);

-- 3) Recreate HNSW index with the same params as 20260607110000_add_hnsw_index
CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
  ON "KnowledgeChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
