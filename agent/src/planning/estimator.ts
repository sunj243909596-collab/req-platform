// Effort estimation for requirements and releases

import type { LLMProvider } from "../llm/client";
import { getSystemPrompt, type SystemPromptOverrides } from "../llm/prompts";

export interface EstimationInput {
  title: string;
  description?: string;
  priority: string;
  module?: string;
  requirementCount?: number;
}

export interface EffortEstimate {
  bestCaseDays: string;
  worstCaseDays: string;
  likelyDays: string;
  confidence: number;
  breakdown: { task: string; days: string }[];
  assumptions: string[];
}

/**
 * Estimate effort for a single requirement or an entire release.
 */
export async function estimateEffort(
  llm: LLMProvider,
  input: EstimationInput,
  historicalData?: { avgDays: number; totalReqs: number },
  promptOverrides?: SystemPromptOverrides
): Promise<EffortEstimate> {
  const historicalContext = historicalData
    ? `历史数据：平均每个需求 ${historicalData.avgDays} 天，共 ${historicalData.totalReqs} 个已完成需求`
    : "";

  const systemPrompt = getSystemPrompt("releasePlanning", `
请评估以下工作的工作量：

需求：${input.title}
描述：${input.description || "无"}
优先级：${input.priority}
模块：${input.module || "未指定"}
${input.requirementCount ? `需求数量：${input.requirementCount}` : ""}
${historicalContext}

请以 JSON 格式返回：
{
  "bestCaseDays": "2天",
  "worstCaseDays": "5天",
  "likelyDays": "3天",
  "confidence": 0.7,
  "breakdown": [{"task": "数据库变更", "days": "0.5天"}],
  "assumptions": ["假设有现成的组件可复用"]
}`,
    promptOverrides
  );
  try {
    const result = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: `预估 "${input.title}" 的工作量` }],
      temperature: 0.3,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as EffortEstimate;

    return {
      bestCaseDays: "待评估",
      worstCaseDays: "待评估",
      likelyDays: "待评估",
      confidence: 0,
      breakdown: [],
      assumptions: ["预估失败，请人工评估"],
    };
  } catch {
    return {
      bestCaseDays: "N/A",
      worstCaseDays: "N/A",
      likelyDays: "N/A",
      confidence: 0,
      breakdown: [],
      assumptions: ["自动预估失败"],
    };
  }
}
