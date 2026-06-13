// DashScope embedding helpers — OpenAI-compatible text API + native multimodal API.

import type { EmbedResult } from "./client";

const MULTIMODAL_MODEL_PATTERNS = [
  /^tongyi-embedding-vision-/i,
  /^qwen[\d.]*-vl-embedding/i,
  /^multimodal-embedding/i,
];

const DASHSCOPE_MULTIMODAL_PATH =
  "/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding";

export function isDashScopeMultimodalModel(model: string): boolean {
  return MULTIMODAL_MODEL_PATTERNS.some((re) => re.test(model));
}

/** Avoid `/v1/v1/embeddings` when baseUrl already ends with `/v1`. */
export function resolveOpenAIEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return `${trimmed}/embeddings`;
  }
  return `${trimmed}/v1/embeddings`;
}

function resolveDashScopeHost(baseUrl?: string): string {
  if (baseUrl?.includes("dashscope-intl.aliyuncs.com")) {
    return "https://dashscope-intl.aliyuncs.com";
  }
  return "https://dashscope.aliyuncs.com";
}

export async function embedDashScopeMultimodal(
  texts: string[],
  config: { model: string; apiKey: string; baseUrl?: string; embeddingDimension?: number }
): Promise<EmbedResult> {
  const host = resolveDashScopeHost(config.baseUrl);
  const url = `${host}${DASHSCOPE_MULTIMODAL_PATH}`;
  const embeddings: number[][] = [];

  // Multimodal API accepts one input per request; batch sequentially.
  for (const text of texts) {
    const body: Record<string, unknown> = {
      model: config.model,
      input: { contents: [{ text }] },
    };
    if (config.embeddingDimension) {
      body.parameters = { dimension: config.embeddingDimension };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`DashScope multimodal embedding error ${response.status}: ${err}`);
    }

    const data = await response.json() as {
      output?: { embeddings?: Array<{ embedding?: number[] }> };
      usage?: { total_tokens?: number };
    };
    const embedding = data.output?.embeddings?.[0]?.embedding;
    if (!embedding?.length) {
      throw new Error("DashScope multimodal embedding returned empty vector");
    }
    embeddings.push(embedding);
  }

  return { embeddings, tokensUsed: 0 };
}
