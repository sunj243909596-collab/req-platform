-- Replace manual search_vector with GENERATED ALWAYS AS (auto-maintained by PG)
-- DROP IF EXISTS handles two cases: old migration applied, or never applied
ALTER TABLE "KnowledgeChunk" DROP COLUMN IF EXISTS search_vector;

-- GENERATED ALWAYS AS STORED: populated on INSERT/UPDATE automatically, no app-side write needed
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

-- GIN index enables fast @@ tsquery lookups instead of full table LIKE scans
CREATE INDEX "KnowledgeChunk_search_vector_gin_idx"
  ON "KnowledgeChunk"
  USING GIN (search_vector);
