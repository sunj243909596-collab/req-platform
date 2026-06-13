// Preliminary solution generation for new requirements

import type { LLMProvider } from "../llm/client";
import { getSystemPrompt, buildKnowledgeContext, type SystemPromptOverrides } from "../llm/prompts";
import type { SolutionPreview } from "shared-types";

export interface SolutionInput {
  title: string;
  description?: string;
  designSolution?: string;
  module?: string;
  relatedTables?: string;
}

/**
 * Generate a preliminary solution using LLM with knowledge base context.
 */
export async function generateSolution(
  llm: LLMProvider,
  input: SolutionInput,
  knowledgeChunks: { content: string; fileName: string; section?: string }[],
  similarReqs: { reqNo: string; title: string }[],
  promptOverrides?: SystemPromptOverrides
): Promise<SolutionPreview> {
  const context = buildKnowledgeContext(knowledgeChunks);

  const similarReqsText = similarReqs.length > 0
    ? `相似历史需求：\n${similarReqs.map(r => `- ${r.reqNo}: ${r.title}`).join("\n")}`
    : "";

  const systemPrompt = getSystemPrompt(
    "solutionGeneration",
    `
请为以下需求生成初步技术方案：

需求标题：${input.title}
需求描述：${input.description || "无"}
设计方案：${input.designSolution || "无"}
相关模块：${input.module || "未指定"}
涉及表：${input.relatedTables || "未指定"}

${similarReqsText}

${context ? `相关知识库内容：\n${context}` : ""}

请以 JSON 格式返回以下结构（不要包含其他内容）：
{
  "overview": "方案概述（100字内）",
  "approach": "技术方案思路",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "references": [{"fileName": "文件名", "section": "章节", "content": "参考内容摘要"}]
}`,
    promptOverrides
  );

  try {
    const result = await llm.chat({
      systemPrompt,
      messages: [{ role: "user", content: `请为 "${input.title}" 生成技术方案` }],
      temperature: 0.5,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SolutionPreview;
    }

    return {
      overview: "方案生成失败，请稍后重试",
      approach: "",
      keyPoints: [],
      references: [],
    };
  } catch (err) {
    return {
      overview: `方案生成出错: ${(err as Error).message}`,
      approach: "",
      keyPoints: [],
      references: [],
    };
  }
}
