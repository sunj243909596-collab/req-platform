-- Change embedding column dimension from 1024 to 768
-- Reason: tongyi-embedding-vision-flash outputs 768-dim vectors (max 768).
-- Existing rows have NULL embeddings (API was broken), so no conversion needed.

DROP INDEX IF EXISTS "KnowledgeChunk_embedding_hnsw_idx";

ALTER TABLE "KnowledgeChunk" ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx"
  ON "KnowledgeChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
