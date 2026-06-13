// LLM Provider abstraction layer
// Supports Claude (Anthropic) and OpenAI, with streaming for chat

import type { ChatMessage, SourceReference, ToolCall } from "shared-types";
import {
  embedDashScopeMultimodal,
  isDashScopeMultimodalModel,
  resolveOpenAIEmbeddingsUrl,
} from "./dashscope-embedding";

export interface LLMConfig {
  provider: "anthropic" | "openai" | "ollama";
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  /** Used by DashScope multimodal embedding models (e.g. tongyi-embedding-vision-flash). */
  embeddingDimension?: number;
}

export interface ChatParams {
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  tokensUsed: { input: number; output: number };
  toolCalls?: ToolCall[];
  model: string;
}

export interface EmbedResult {
  embeddings: number[][];
  tokensUsed: number;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMProvider {
  chat(params: ChatParams): Promise<ChatResult>;
  chatStream(params: ChatParams): AsyncIterable<{ type: "text" | "tool_call" | "done" | "thinking"; content: string; metadata?: unknown }>;
  embed(texts: string[]): Promise<EmbedResult>;
  countTokens(text: string): Promise<number>;
}

// ==================== Claude Provider ====================

export function createClaudeProvider(config: LLMConfig): LLMProvider {
  const baseUrl = config.baseUrl || "https://api.anthropic.com";

  async function chatImpl(params: ChatParams, stream: boolean): Promise<ChatResult | AsyncIterable<{ type: string; content: string; metadata?: unknown }>> {
    const headers: Record<string, string> = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };

    const systemMessages = params.messages.filter(m => m.role === "system");
    const userAssistant = params.messages.filter(m => m.role !== "system");

    const systemText = [params.systemPrompt, ...systemMessages.map(m => m.content)].filter(Boolean).join("\n\n");

    const body: Record<string, unknown> = {
      model: config.model,
      system: systemText,
      messages: userAssistant.map(m => ({ role: m.role, content: m.content })),
      max_tokens: params.maxTokens || config.maxTokens || 4096,
      temperature: params.temperature ?? config.temperature ?? 0.7,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
    }

    if (stream) {
      body.stream = true;
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API error ${response.status}: ${err}`);
      }

      // SSE iterator with cross-chunk line buffering
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body for streaming");
      const decoder = new TextDecoder();
      let buffer = ""; // accumulates incomplete lines across chunks

      /** Parse SSE data lines into accumulated text */
      const parseDataLines = (lines: string[]): string => {
        return lines
          .filter(l => l.startsWith("data: "))
          .map(l => {
            try {
              const d = JSON.parse(l.slice(6));
              if (d.type === "content_block_delta") return d.delta?.text || "";
              return "";
            } catch { return ""; }
          })
          .join("");
      };

      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // Stream ended — parse any remaining buffered data
                  if (buffer.trim()) {
                    const lines = buffer.split("\n");
                    buffer = "";
                    const content = parseDataLines(lines);
                    if (content) {
                      return { done: false, value: { type: "text" as const, content } };
                    }
                  }
                  return { done: true, value: undefined };
                }
                const text = buffer + decoder.decode(value, { stream: true });
                const rawLines = text.split("\n");
                // Last element may be incomplete — save it for next chunk
                buffer = rawLines.pop() || "";

                const content = parseDataLines(rawLines);
                if (content) {
                  return { done: false, value: { type: "text" as const, content } };
                }
                // No complete text event in this chunk, continue reading
              }
            },
          };
        },
      };
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST", headers, body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const textContent = data.content
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n");

    return {
      content: textContent,
      tokensUsed: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
      },
      model: data.model,
    };
  }

  return {
    async chat(params: ChatParams): Promise<ChatResult> {
      return chatImpl(params, false) as Promise<ChatResult>;
    },

    chatStream(params: ChatParams): AsyncIterable<{ type: "text" | "tool_call" | "done"; content: string; metadata?: unknown }> {
      return chatImpl(params, true) as unknown as AsyncIterable<{
        type: "text" | "tool_call" | "done";
        content: string;
        metadata?: unknown;
      }>;
    },

    async embed(_texts: string[]): Promise<EmbedResult> {
      // Claude (Anthropic) does not provide an embedding API.
      // Use embedder.service.ts which always creates an OpenAI-compatible provider
      // with the configured embeddingBaseUrl / embeddingApiKey.
      throw new Error(
        "Claude provider does not support embeddings. " +
        "Embeddings are handled by the dedicated OpenAI-compatible provider " +
        "configured via embeddingBaseUrl / embeddingApiKey in Agent settings."
      );
    },

    async countTokens(text: string): Promise<number> {
      // Heuristic estimation — not exact tokenization.
      // Accurate counting would require tiktoken (Python) or a WASM port.
      // Rough ratios observed in practice:
      //   - CJK characters: ~1.5 chars per token
      //   - Latin/English words: ~4 chars per token
      //   - Digits/punctuation/whitespace: ~3.5 chars per token
      const cjk = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      const other = text.length - cjk - latin;
      return Math.ceil(cjk / 1.5 + latin / 4 + other / 3.5);
    },
  };
}

// ==================== OpenAI Provider ====================

export function createOpenAIProvider(config: LLMConfig): LLMProvider {
  const baseUrl = config.baseUrl || "https://api.openai.com";

  return {
    async chat(params: ChatParams): Promise<ChatResult> {
      const messages = [
        { role: "system" as const, content: params.systemPrompt },
        ...params.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: params.maxTokens || config.maxTokens || 4096,
          temperature: params.temperature ?? config.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const choice = data.choices[0];

      return {
        content: choice.message?.content || "",
        tokensUsed: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0,
        },
        model: data.model,
      };
    },

    async *chatStream(params: ChatParams) {
      const messages = [
        { role: "system" as const, content: params.systemPrompt },
        ...params.messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          max_tokens: params.maxTokens || config.maxTokens || 4096,
          temperature: params.temperature ?? config.temperature ?? 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${err}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const d = JSON.parse(line.slice(6));
            const delta = d.choices?.[0]?.delta || {};
            // thinking / reasoning content (DeepSeek, Qwen, etc.)
            const reasoning = delta.reasoning_content || delta.thinking || "";
            if (reasoning) yield { type: "thinking" as const, content: reasoning };
            const text = delta.content || "";
            if (text) yield { type: "text" as const, content: text };
          } catch { /* skip parse errors */ }
        }
      }
      yield { type: "done", content: "" };
    },

    async embed(texts: string[]): Promise<EmbedResult> {
      // tongyi-embedding-vision-* / qwen-vl-embedding use DashScope native
      // multimodal API — NOT the OpenAI-compatible /v1/embeddings endpoint.
      if (isDashScopeMultimodalModel(config.model)) {
        return embedDashScopeMultimodal(texts, {
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          embeddingDimension: config.embeddingDimension,
        });
      }

      const response = await fetch(resolveOpenAIEmbeddingsUrl(baseUrl), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI Embedding error ${response.status}: ${err}`);
      }

      const data = await response.json();
      return {
        embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
        tokensUsed: data.usage?.total_tokens || 0,
      };
    },

    async countTokens(text: string): Promise<number> {
      // Heuristic estimation — see Claude provider for detailed comments
      const cjk = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
      const latin = (text.match(/[a-zA-Z]/g) || []).length;
      const other = text.length - cjk - latin;
      return Math.ceil(cjk / 1.5 + latin / 4 + other / 3.5);
    },
  };
}

// ==================== Factory ====================

export function createLLMProvider(config?: Partial<LLMConfig>): LLMProvider {
  const provider = config?.provider || (process.env.LLM_PROVIDER as "anthropic" | "openai") || "anthropic";
  const apiKey = config?.apiKey || (provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || "";

  const fullConfig: LLMConfig = {
    provider,
    model: config?.model || process.env.LLM_MODEL || "claude-sonnet-4-20250514",
    apiKey,
    baseUrl: config?.baseUrl,
    maxTokens: config?.maxTokens || 4096,
    temperature: config?.temperature ?? 0.7,
    embeddingDimension: config?.embeddingDimension,
  };

  switch (fullConfig.provider) {
    case "anthropic": return createClaudeProvider(fullConfig);
    case "openai": return createOpenAIProvider(fullConfig);
    case "ollama": return createOpenAIProvider({ ...fullConfig, baseUrl: fullConfig.baseUrl || "http://localhost:11434/v1" });
    default: throw new Error(`Unknown LLM provider: ${fullConfig.provider}`);
  }
}
