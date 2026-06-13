// 知识库智能选库 — 可配置系统提示词与默认模板

import type { KbRoutingCandidate } from "./kb-router.service";
import { formatRoutingExamplesForCatalog } from "./kb-routing-examples";

/** 内置默认路由系统提示词（恢复默认时使用） */
export const DEFAULT_KB_ROUTING_SYSTEM_PROMPT = `你是 WMOS 需求平台的知识库路由助手。

任务：根据用户问题，从消息中提供的「已启用知识库列表」里选出最相关的 1～{{maxKb}} 个库（优先选择分块数 > 0 的库）。

规则：
1. 只根据各库的名称、说明、文档类型判断，不要猜测库内未列出的内容。
2. 问题明显只属于某一主题时，只选 1 个库；跨主题（如表结构 + GSP）才选多个。
3. 若无法判断，选择说明与用户问题关键词重叠最多的库。
4. 只输出合法 JSON，不要 markdown、不要解释性段落。

输出格式（严格遵守）：
{"kbIds":[数字id数组],"reason":"一句话说明为何选这些库"}`;

export function resolveKbRoutingSystemPrompt(custom: string | null | undefined): string {
  const trimmed = custom?.trim();
  return trimmed || DEFAULT_KB_ROUTING_SYSTEM_PROMPT;
}

/** 将 {{maxKb}} 替换为实际配置值 */
export function applyMaxKbToSystemPrompt(systemPrompt: string, maxKb: number): string {
  return systemPrompt.replace(/\{\{maxKb\}\}/g, String(maxKb));
}

export function buildKbRoutingCatalog(bases: KbRoutingCandidate[]): string {
  return bases
    .map((b) => {
      const examples = formatRoutingExamplesForCatalog(b.routingExamples, b.id);
      return `- id=${b.id} | 名称=${b.displayName} (${b.name}) | 说明=${b.description || "无"} | 类型=${b.docType || "混合"} | 分块数=${b.chunkCount}${examples}`;
    })
    .join("\n");
}

export function buildKbRoutingUserMessage(
  query: string,
  catalog: string,
  maxKb: number
): string {
  return `从下列**已启用**知识库中选出最相关的 1～${maxKb} 个（只选有内容的库优先）。

【知识库列表】
${catalog}

【用户问题】
${query}

请只输出 JSON，不要其它文字：
{"kbIds":[数字id数组],"reason":"一句话说明为何选这些库"}`;
}
