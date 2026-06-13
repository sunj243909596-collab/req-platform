// LLM 优化对话/分析系统提示词（仅管理员）

import { getLLM } from "./llm.service";
import {
  DEFAULT_SYSTEM_PROMPTS,
  SYSTEM_PROMPT_LABELS,
  type SystemPromptConfigKey,
} from "./system-prompt-defaults";

export async function optimizeSystemPrompt(
  key: SystemPromptConfigKey,
  currentPrompt: string | null | undefined
): Promise<string> {
  const llm = getLLM();
  const base = currentPrompt?.trim() || DEFAULT_SYSTEM_PROMPTS[key];
  const label = SYSTEM_PROMPT_LABELS[key];

  const keyHints: Record<SystemPromptConfigKey, string> = {
    chat: "定义 WMOS 医药物流仓储 AI 助手的角色、能力边界与回答风格；不涉及选库逻辑。",
    ragCitationSuffix:
      "定义 RAG 模式下必须遵守的引用格式、禁止编造表名/字段、wm_inventory 与禁止 inv_inventory 等约束。",
    requirementAnalysis: "用于新需求创建后的 JSON 可行性分析输出。",
    requirementAssistant: "用于需求详情页结合检索片段回答技术问题。",
    releasePlanning: "用于发版工作量与排期建议。",
    solutionGeneration: "用于生成技术方案初稿。",
  };

  const res = await llm.chat({
    systemPrompt:
      "你是 Prompt 工程专家。只输出优化后的完整提示词正文，不要前言、不要 markdown 代码块。",
    messages: [
      {
        role: "user",
        content: `请优化下列 WMOS 需求平台「${label}」系统提示词片段。

场景说明：${keyHints[key]}

要求：
1. 保持中文，简洁可执行
2. 不要混入知识库选库/路由逻辑（那是独立的路由提示词）
3. 保留原有核心约束（尤其 RAG 引用、表名白名单、禁止幻觉等）
4. 直接输出完整正文

【当前提示词】
${base}

请输出优化后的完整提示词：`,
      },
    ],
    temperature: 0.3,
    maxTokens: 2500,
  });

  const text = res.content.trim();
  if (!text) throw new Error("模型未返回优化结果");
  return text.replace(/^```[\w]*\n?/m, "").replace(/\n?```$/m, "").trim();
}
