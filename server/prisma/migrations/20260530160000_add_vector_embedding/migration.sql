-- Drop old JSON embedding column (all values are null anyway)
ALTER TABLE "KnowledgeChunk" DROP COLUMN "embedding";

-- Add new pgvector column
ALTER TABLE "KnowledgeChunk" ADD COLUMN "embedding" vector(1536);

-- Create IVFFlat index for fast approximate nearest neighbor search
-- (Note: IVFFlat requires data before building index; we'll create it after re-sync)
-- CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk" 
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
