// Embedding 提供方（供 RAG 检索与 agent 共用，避免循环依赖）
import { createLLMProvider, createEmbedder, type Embedder } from "agent";
import { readConfig, resolveEmbeddingBaseUrl } from "./agent-config.service";

let _embedder: Embedder | null = null;
let _hash = "";

function configHash(): string {
  const cfg = readConfig();
  return `${cfg.embeddingModel}|${cfg.embeddingApiKey}|${cfg.embeddingBaseUrl}`;
}

/** 返回带 20-batch 分批的 Embedder（embedTexts + embedQuery） */
export function getEmbedder(): Embedder {
  const hash = configHash();
  if (!_embedder || hash !== _hash) {
    const cfg = readConfig();
    const llm = createLLMProvider({
      provider: "openai",
      model: cfg.embeddingModel,
      apiKey: cfg.embeddingApiKey,
      baseUrl: resolveEmbeddingBaseUrl(cfg),
      embeddingDimension: cfg.embeddingDimension,
    });
    _embedder = createEmbedder(llm);
    _hash = hash;
  }
  return _embedder;
}

export async function embedQueryText(query: string): Promise<number[] | null> {
  try {
    const vec = await getEmbedder().embedQuery(query);
    return vec?.length ? vec : null;
  } catch {
    return null;
  }
}
