// 对话 LLM 单例（供 agent、知识库路由等共用）
import { createLLMProvider, type LLMProvider } from "agent";
import { readConfig, resolveBaseUrl } from "./agent-config.service";

let _llm: LLMProvider | null = null;
let _llmConfigHash = "";

function configHash(): string {
  try {
    const cfg = readConfig();
    return `${cfg.llmProvider}|${cfg.llmModel}|${cfg.llmApiKey}|${cfg.llmBaseUrl}`;
  } catch {
    return "";
  }
}

export function getLLM(): LLMProvider {
  const hash = configHash();
  if (!_llm || hash !== _llmConfigHash) {
    const cfg = readConfig();
    const providerType = cfg.llmProvider === "custom" ? "openai" : cfg.llmProvider;
    _llm = createLLMProvider({
      provider: providerType as "anthropic" | "openai" | "ollama",
      model: cfg.llmModel,
      apiKey: cfg.llmApiKey,
      baseUrl: resolveBaseUrl(cfg),
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    });
    _llmConfigHash = hash;
  }
  return _llm;
}
