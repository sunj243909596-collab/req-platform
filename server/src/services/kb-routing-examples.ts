// 知识库路由样例：问题 → 应选知识库 id 列表

export interface KbRoutingExample {
  question: string;
  kbIds: number[];
  note?: string;
}

export function parseRoutingExamples(raw: unknown): KbRoutingExample[] | null {
  if (raw == null || raw === "") return null;
  if (!Array.isArray(raw)) {
    throw new Error("routingExamples 必须是 JSON 数组");
  }
  const out: KbRoutingExample[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown>;
    const question = typeof item.question === "string" ? item.question.trim() : "";
    if (!question) throw new Error(`routingExamples[${i}].question 不能为空`);
    const kbIdsRaw = item.kbIds;
    if (!Array.isArray(kbIdsRaw) || kbIdsRaw.length === 0) {
      throw new Error(`routingExamples[${i}].kbIds 须为非空数字数组`);
    }
    const kbIds = kbIdsRaw.map((id) => {
      const n = typeof id === "number" ? id : parseInt(String(id), 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`routingExamples[${i}].kbIds 含无效 id`);
      return n;
    });
    const note = typeof item.note === "string" ? item.note.trim() : undefined;
    out.push({ question, kbIds, ...(note ? { note } : {}) });
  }
  return out.length > 0 ? out : null;
}

/** 将某库的样例格式化为 catalog 一行补充 */
export function formatRoutingExamplesForCatalog(
  examples: KbRoutingExample[] | null | undefined,
  kbId: number
): string {
  if (!examples?.length) return "";
  const relevant = examples.filter((ex) => ex.kbIds.includes(kbId));
  if (relevant.length === 0) return "";
  const parts = relevant
    .slice(0, 5)
    .map((ex) => `「${ex.question.slice(0, 80)}」→ 应含本库(id=${kbId})`);
  return ` | 路由样例: ${parts.join("; ")}`;
}
