// Release scheduling and dependency analysis

import type { LLMProvider } from "../llm/client";
import { getSystemPrompt, type SystemPromptOverrides } from "../llm/prompts";

export interface SchedulerInput {
  releaseName: string;
  requirements: {
    id: number;
    reqNo: string;
    title: string;
    priority: string;
    status: string;
  }[];
  targetDate?: string;
}

export interface ScheduleSuggestion {
  recommendedOrder: { reqNo: string; title: string; reason: string }[];
  risks: string[];
  suggestions: string[];
}

/**
 * Analyze requirements within a release and suggest optimal scheduling.
 */
export async function suggestSchedule(
  llm: LLMProvider,
  input: SchedulerInput,
  promptOverrides?: SystemPromptOverrides
): Promise<ScheduleSuggestion> {
  const reqList = input.requirements
    .map(r => `- ${r.reqNo} [${r.priority}][${r.status}]: ${r.title}`)
    .join("\n");

  const systemPrompt = getSystemPrompt("releasePlanning", `
分析以下发版的需求列表，提供排期建议：

发版：${input.releaseName}
目标日期：${input.targetDate || "未设定"}
需求列表：
${reqList}

请以 JSON 格式返回：
{
  "recommendedOrder": [{"reqNo": "REQ-001", "title": "标题", "reason": "建议原因"}],
  "risks": ["风险1"],
  "suggestions": ["建议1"]
}`,
    promptOverrides
  );
  try {
    const result = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: `为发版 "${input.releaseName}" 提供排期建议` }],
      temperature: 0.4,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as ScheduleSuggestion;

    return {
      recommendedOrder: [],
      risks: ["自动分析失败"],
      suggestions: ["请人工规划排期"],
    };
  } catch {
    return {
      recommendedOrder: [],
      risks: ["分析服务不可用"],
      suggestions: ["请稍后重试"],
    };
  }
}

export interface DependencyResult {
  groups: { reqNos: string[]; reason: string }[];
  blocking: { from: string; to: string; reason: string }[];
}

/**
 * Analyze dependencies between requirements.
 */
export async function analyzeDependencies(
  llm: LLMProvider,
  requirements: { reqNo: string; title: string; description?: string }[],
  promptOverrides?: SystemPromptOverrides
): Promise<DependencyResult> {
  const reqList = requirements
    .map(r => `- ${r.reqNo}: ${r.title}\n  ${r.description || ""}`)
    .join("\n");

  const systemPrompt = getSystemPrompt("releasePlanning", `
分析以下需求之间的依赖关系和执行顺序：

${reqList}

请以 JSON 格式返回：
{
  "groups": [{"reqNos": ["REQ-001", "REQ-002"], "reason": "分组原因"}],
  "blocking": [{"from": "REQ-001", "to": "REQ-002", "reason": "依赖原因"}]
}`,
    promptOverrides
  );
  try {
    const result = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: "分析需求依赖关系" }],
      temperature: 0.3,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as DependencyResult;

    return { groups: [], blocking: [] };
  } catch {
    return { groups: [], blocking: [] };
  }
}
