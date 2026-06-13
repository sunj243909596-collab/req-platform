-- HNSW index on KnowledgeChunk.embedding for cosine approximate nearest neighbor
-- Requires pgvector >= 0.5.0 (using 0.8.0)
-- m=16 (connections per layer, default); ef_construction=64 (build quality, default)
-- To tune query-time recall: SET hnsw.ef_search = 100 per session/GUC
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_embedding_hnsw_idx"
  ON "KnowledgeChunk"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
