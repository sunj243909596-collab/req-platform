// Duplicate requirement detection

import type { SimilarReqResult } from "./similar";

export interface DuplicateWarning {
  reqId: number;
  reqNo: string;
  title: string;
  similarity: number;
  reason: string;
}

const HIGH_SIMILARITY_THRESHOLD = 0.92;
const MEDIUM_SIMILARITY_THRESHOLD = 0.80;

/**
 * Detect potential duplicates from similar requirement results.
 */
export function detectDuplicates(similarReqs: SimilarReqResult[]): DuplicateWarning[] {
  return similarReqs
    .filter(r => r.similarity >= MEDIUM_SIMILARITY_THRESHOLD)
    .map(r => ({
      reqId: r.reqId,
      reqNo: r.reqNo,
      title: r.title,
      similarity: r.similarity,
      reason: r.similarity >= HIGH_SIMILARITY_THRESHOLD
        ? "标题和描述高度相似，大概率是重复需求，建议合并或标记为关联"
        : "存在较高的相似度，请确认是否为同一功能的重复提交",
    }));
}
