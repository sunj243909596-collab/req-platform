-- Change embedding column dimension from 768 to 1024
-- Reason: switching to dashscope text-embedding-v4 (default 1024 dims).

DROP INDEX IF EXISTS "KnowledgeChunk_embedding_hnsw_idx";

ALTER TABLE "KnowledgeChunk" ALTER COLUMN embedding TYPE vector(1024);

CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
  ON "KnowledgeChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
