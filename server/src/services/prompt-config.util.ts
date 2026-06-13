// 提示词配置纯函数，避免 agent-config 与 system-prompt-resolver 循环依赖

import type { SystemPromptOverrides } from "agent";

export function normalizeSystemPromptsPatch(
  patch: SystemPromptOverrides | null | undefined
): SystemPromptOverrides | null {
  if (!patch) return null;
  const out: SystemPromptOverrides = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) {
      (out as Record<string, null>)[k] = null;
      continue;
    }
    const trimmed = String(v).trim();
    (out as Record<string, string | null>)[k] = trimmed || null;
  }
  return Object.keys(out).length > 0 ? out : null;
}
