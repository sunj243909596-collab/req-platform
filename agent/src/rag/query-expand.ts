/** 多路查询扩展（不调用 LLM） */
export function expandSearchQueries(query: string, maxQueries = 3): string[] {
  const q = query.trim();
  if (!q) return [];

  const out: string[] = [q];
  const tokens =
    q.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z][a-zA-Z0-9_]{1,}/g) ?? [];

  for (const t of tokens) {
    if (out.length >= maxQueries) break;
    if (!out.includes(t)) out.push(t);
  }

  return out.slice(0, maxQueries);
}
