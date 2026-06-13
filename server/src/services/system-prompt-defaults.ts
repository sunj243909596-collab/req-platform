// 内置对话/分析系统提示词默认值（与 agent 包保持一致）

import {
  SYSTEM_PROMPTS,
  RAG_CITATION_SUFFIX,
  type SystemPromptContext,
} from "agent";

export type SystemPromptConfigKey = SystemPromptContext | "ragCitationSuffix";

export const SYSTEM_PROMPT_LABELS: Record<SystemPromptConfigKey, string> = {
  chat: "AI 对话主角色",
  ragCitationSuffix: "RAG 引用与表名约束",
  requirementAnalysis: "需求自动分析",
  requirementAssistant: "需求详情问答",
  releasePlanning: "发版排期建议",
  solutionGeneration: "技术方案生成",
};

export const DEFAULT_SYSTEM_PROMPTS: Record<SystemPromptConfigKey, string> = {
  chat: SYSTEM_PROMPTS.chat,
  ragCitationSuffix: RAG_CITATION_SUFFIX,
  requirementAnalysis: SYSTEM_PROMPTS.requirementAnalysis,
  requirementAssistant: SYSTEM_PROMPTS.requirementAssistant,
  releasePlanning: SYSTEM_PROMPTS.releasePlanning,
  solutionGeneration: SYSTEM_PROMPTS.solutionGeneration,
};

export const PRIMARY_SYSTEM_PROMPT_KEYS: SystemPromptConfigKey[] = [
  "chat",
  "ragCitationSuffix",
];

export const ADVANCED_SYSTEM_PROMPT_KEYS: SystemPromptConfigKey[] = [
  "requirementAnalysis",
  "requirementAssistant",
  "releasePlanning",
  "solutionGeneration",
];
