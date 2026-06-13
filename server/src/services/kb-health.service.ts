// KB health check — returns indexing quality metrics for a single knowledge base
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface KbHealthResult {
  kbId: number;
  /** 文档总数 */
  documentCount: number;
  /** chunk 总数 */
  chunkTotal: number;
  /** 无向量 chunk 数（text-only 降级） */
  nullEmbeddingChunks: number;
  /** 零 chunk 文档数（索引失败） */
  zeroChunkDocuments: number;
  /** 无向量占比 [0, 1] */
  nullEmbeddingRate: number;
}

export async function getKbHealth(kbId: number): Promise<KbHealthResult> {
  const [docRow] = await prisma.$queryRawUnsafe<[{ doc_count: bigint; zero_chunk_docs: bigint }]>(
    `SELECT
       COUNT(*)                                               AS doc_count,
       COUNT(*) FILTER (WHERE chunk_count = 0 OR chunk_count IS NULL) AS zero_chunk_docs
     FROM "KnowledgeDocument"
     WHERE knowledge_base_id = $1`,
    kbId
  );

  const [chunkRow] = await prisma.$queryRawUnsafe<[{ total: bigint; null_emb: bigint }]>(
    `SELECT
       COUNT(*)                                   AS total,
       COUNT(*) FILTER (WHERE embedding IS NULL)  AS null_emb
     FROM "KnowledgeChunk" kc
     JOIN "KnowledgeDocument" kd ON kc.document_id = kd.id
     WHERE kd.knowledge_base_id = $1`,
    kbId
  );

  const chunkTotal = Number(chunkRow?.total ?? 0);
  const nullEmbeddingChunks = Number(chunkRow?.null_emb ?? 0);

  return {
    kbId,
    documentCount: Number(docRow?.doc_count ?? 0),
    chunkTotal,
    nullEmbeddingChunks,
    zeroChunkDocuments: Number(docRow?.zero_chunk_docs ?? 0),
    nullEmbeddingRate: chunkTotal > 0 ? nullEmbeddingChunks / chunkTotal : 0,
  };
}
