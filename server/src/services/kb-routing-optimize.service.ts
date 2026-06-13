// 由 LLM 优化知识库路由系统提示词（仅管理员触发）

import { getLLM } from "./llm.service";
import {
  DEFAULT_KB_ROUTING_SYSTEM_PROMPT,
  buildKbRoutingCatalog,
} from "./kb-routing-prompt";
import type { KbRoutingCandidate } from "./kb-router.service";

export async function optimizeKbRoutingSystemPrompt(
  currentPrompt: string | null | undefined,
  bases: KbRoutingCandidate[]
): Promise<string> {
  const llm = getLLM();
  const catalog = buildKbRoutingCatalog(bases);
  const base = currentPrompt?.trim() || DEFAULT_KB_ROUTING_SYSTEM_PROMPT;

  const res = await llm.chat({
    systemPrompt:
      "你是 Prompt 工程专家，擅长编写结构化、可执行的 LLM 系统提示词。只输出优化后的完整提示词正文，不要加前言、不要 markdown 代码块。",
    messages: [
      {
        role: "user",
        content: `请优化下列「知识库路由」系统提示词，使其能更准确地把用户问题映射到正确的知识库。

要求：
1. 保留任务目标：根据用户问题从列表中选 1～N 个知识库 id，输出 JSON {"kbIds":[],"reason":""}
2. 强调依据各库的「说明」字段判断，禁止编造库内内容
3. 说明多库/单库选择策略
4. 保留占位符 {{maxKb}}（不要替换成具体数字）
5. 明确只输出 JSON、不要其它文字
6. 使用中文，简洁可执行

【当前提示词】
${base}

【当前已启用知识库概况（供你理解业务边界）】
${catalog || "（暂无已启用知识库）"}

请直接输出优化后的完整系统提示词：`,
      },
    ],
    temperature: 0.3,
    maxTokens: 2000,
  });

  const text = res.content.trim();
  if (!text) throw new Error("模型未返回优化结果");
  return text.replace(/^```[\w]*\n?/m, "").replace(/\n?```$/m, "").trim();
}
