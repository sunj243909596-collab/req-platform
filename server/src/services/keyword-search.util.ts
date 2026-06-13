/** 关键词检索：分词、tsquery、分数归一化（与向量分 0.58+ 区分） */

/** 中英文混合查询分词（与 expandSearchQueries 规则一致） */
export function tokenizeSearchQuery(query: string, maxTokens = 12): string[] {
  const q = query.trim();
  if (!q) return [];

  const out: string[] = [];
  const lower = q.toLowerCase();
  if (lower.length >= 2) out.push(lower.slice(0, 120));

  const tokens = q.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z][a-zA-Z0-9_]{1,}/g) ?? [];
  for (const t of tokens) {
    const tok = t.toLowerCase();
    if (tok.length >= 2 && !out.includes(tok)) out.push(tok);
  }

  return out.slice(0, maxTokens);
}

/** 供 websearch_to_tsquery('simple', ...) 的拉丁/标识符片段 */
export function latinTsQueryText(keywords: string[]): string {
  const latin = keywords.filter((k) => /^[a-zA-Z0-9_]/.test(k));
  return latin.join(" ").trim();
}

/** 关键词 raw_score（约 0–1）映射到与向量可混合的区间 */
export function normalizeKeywordScore(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0.38;
  return Math.min(0.72, Math.max(0.38, raw));
}

/** 至少命中几个词（软 AND：半数向上取整，至少 1） */
export function minKeywordHits(tokenCount: number): number {
  if (tokenCount <= 0) return 1;
  return Math.max(1, Math.ceil(tokenCount * 0.5));
}

/** 构造 OR tsquery 文本，供 to_tsquery('simple', ...) 使用
 *  过滤含空格或特殊符号的词，保留中英文字母数字下划线组成的词 */
export function buildOrTsQueryText(keywords: string[]): string {
  const safe = keywords.filter(
    (k) => k.length >= 2 && /^[一-龥a-zA-Z0-9_]+$/.test(k)
  );
  return safe.length > 0 ? safe.join(" | ") : "";
}
