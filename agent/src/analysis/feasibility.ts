// Feasibility analysis for new requirements

import type { LLMProvider } from "../llm/client";
import { getSystemPrompt, buildKnowledgeContext, type SystemPromptOverrides } from "../llm/prompts";
import type { FeasibilityAssessment } from "shared-types";

export interface FeasibilityInput {
  title: string;
  description?: string;
  module?: string;
  terminals?: string[];
  relatedTables?: string;
}

/**
 * Generate a feasibility assessment using LLM with knowledge base context.
 */
export async function assessFeasibility(
  llm: LLMProvider,
  input: FeasibilityInput,
  knowledgeChunks: { content: string; fileName: string; section?: string }[],
  promptOverrides?: SystemPromptOverrides
): Promise<FeasibilityAssessment> {
  const context = buildKnowledgeContext(knowledgeChunks);
  const systemPrompt = getSystemPrompt(
    "requirementAnalysis",
    `
请分析以下需求的可行性：

需求标题：${input.title}
需求描述：${input.description || "无"}
相关模块：${input.module || "未指定"}
终端：${input.terminals?.join(", ") || "未指定"}
涉及表：${input.relatedTables || "未指定"}

${context ? `相关知识库内容：\n${context}` : ""}

请以 JSON 格式返回以下结构（不要包含其他内容）：
{
  "feasible": true/false,
  "confidence": 0-1,
  "tablesInvolved": ["表1", "表2"],
  "modulesInvolved": ["模块1"],
  "estimatedEffortDays": "3-5天",
  "risks": ["风险1", "风险2"],
  "summary": "总体评估说明"
}`,
    promptOverrides
  );

  try {
    const result = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: `分析需求 "${input.title}" 的可行性` }],
      temperature: 0.3,
    });

    // Try to parse JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FeasibilityAssessment;
    }

    // Fallback: return basic assessment
    return {
      feasible: true,
      confidence: 0.5,
      tablesInvolved: [],
      modulesInvolved: [],
      estimatedEffortDays: "待评估",
      risks: ["无法自动评估，建议人工审核"],
      summary: result.content.slice(0, 500),
    };
  } catch (err) {
    return {
      feasible: true,
      confidence: 0,
      tablesInvolved: [],
      modulesInvolved: [],
      estimatedEffortDays: "分析失败",
      risks: [(err as Error).message],
      summary: "可行性分析生成失败，请稍后重试",
    };
  }
}
