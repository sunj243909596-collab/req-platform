// 从 agent-config 解析系统提示词覆盖项

import { getSystemPrompt, type SystemPromptOverrides, type SystemPromptContext } from "agent";
import { readConfig, type AgentConfigData } from "./agent-config.service";
import { normalizeSystemPromptsPatch } from "./prompt-config.util";

export { normalizeSystemPromptsPatch };

export function getConfigSystemPromptOverrides(
  cfg?: AgentConfigData
): SystemPromptOverrides | undefined {
  const sp = (cfg ?? readConfig()).systemPrompts;
  if (!sp) return undefined;
  const out: SystemPromptOverrides = {};
  for (const [k, v] of Object.entries(sp)) {
    if (v?.trim()) (out as Record<string, string>)[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveSystemPrompt(
  context: SystemPromptContext,
  extraContext?: string,
  cfg?: AgentConfigData
): string {
  return getSystemPrompt(context, extraContext, getConfigSystemPromptOverrides(cfg));
}
