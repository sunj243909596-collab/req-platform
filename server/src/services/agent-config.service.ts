// Agent configuration persisted to a JSON file.
// Falls back to environment variables when not configured.

import fs from "fs";
import path from "path";
import type { SystemPromptOverrides } from "agent";
import { normalizeSystemPromptsPatch } from "./prompt-config.util";

const CONFIG_FILE = path.join(process.cwd(), "agent-config.json");

export type LlmProvider = "anthropic" | "openai" | "ollama" | "custom";

export interface AgentConfigData {
  llmProvider: LlmProvider;
  llmModel: string;
  llmApiKey: string;       // stored in plain text; never returned to client unmasked
  llmBaseUrl: string;      // custom endpoint URL (optional for anthropic/openai)
  embeddingProvider: "openai";
  embeddingModel: string;
  embeddingApiKey: string;
  embeddingBaseUrl: string;
  /** 向量维度，必须与 embeddingModel 输出维度一致；修改后需重建 KnowledgeChunk 表的向量列 */
  embeddingDimension: number;
  maxTokens: number;
  temperature: number;
  features: {
    autoAnalysis: boolean;
    chatEnabled: boolean;
    planningSuggestions: boolean;
  };
  rag: RagConfig;
  /** 对话/分析检索时使用的知识库 ID；未设置则用第一个 enabled 库 */
  activeKnowledgeBaseId?: number | null;
  /** 知识库智能选库系统提示词；空则使用内置默认 */
  kbRoutingSystemPrompt?: string | null;
  /** 对话/分析各场景系统提示词覆盖；空则使用 agent 内置默认 */
  systemPrompts?: SystemPromptOverrides | null;
}

export interface RagConfig {
  topK: number;           // number of chunks returned from KB search
  contextMaxTokens: number; // max tokens for knowledge context in prompt
  chatTemperature: number; // temperature for KB Q&A (low = deterministic)
  chunkMaxCharsMd: number; // max chars per chunk for Markdown docs
  chunkMaxCharsText: number; // max chars per chunk for plain text
  /** Markdown 分块滑动重叠字符数 */
  chunkOverlapMd: number;
  /** 检索返回单 chunk 最大字符数（防止截断大字段表） */
  chunkRetrievalChars: number;
  /** 向量相似度下限（cosine similarity），低于此值的 chunk 不进入上下文 */
  similarityThreshold: number;
  /** 向量召回候选倍数（先取 topK * N 再过滤/重排） */
  vectorCandidateMultiplier: number;
  /** 检索默认文档类型过滤（如 design、code）；空表示不过滤 */
  searchDocType?: string | null;
  /** 检索默认路径前缀（relative_path 前缀）；空表示不过滤 */
  searchPathPrefix?: string | null;
  /** 混合检索：向量 + 关键词加权 */
  hybridSearchEnabled?: boolean;
  hybridVectorWeight?: number;
  hybridKeywordWeight?: number;
  /** 多路查询扩展（原问 + 关键词） */
  multiQueryEnabled?: boolean;
  multiQueryMax?: number;
  /** HyDE：用 LLM 生成假设性文档片段再检索（较慢，需 LLM Key） */
  hydeEnabled?: boolean;
  /** RAG 回答强制引用来源 */
  requireCitation?: boolean;
  /** 多知识库时由 LLM/启发式先选库再检索 */
  kbRoutingEnabled?: boolean;
  /** 单次最多检索几个知识库 */
  kbRoutingMaxKb?: number;
  /** 对候选 chunk 做 LLM 语义重排（需 LLM Key，略增延迟） */
  llmRerankEnabled?: boolean;
  /** 送入 LLM 重排的最大候选数 */
  llmRerankCandidateK?: number;
  /** 每条候选送入 LLM 的正文预览字符数 */
  llmRerankPreviewChars?: number;
  /** 开启后 docType 过滤走硬路由旁路,不经过 LLM 选库 */
  ragDocTypeStrict?: boolean;
}

// Safe version returned to the client — keys are masked
export type AgentConfigPublic = Omit<AgentConfigData, "llmApiKey" | "embeddingApiKey"> & {
  llmApiKeyMasked: string;
  embeddingApiKeyMasked: string;
};

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "***";
  return key.slice(0, 6) + "***" + key.slice(-4);
}

function defaults(): AgentConfigData {
  return {
    llmProvider: (process.env.LLM_PROVIDER || "anthropic") as LlmProvider,
    llmModel: process.env.LLM_MODEL || "claude-sonnet-4-20250514",
    llmApiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "",
    llmBaseUrl: "",
    embeddingProvider: "openai",
    embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    embeddingApiKey: process.env.OPENAI_API_KEY || "",
    embeddingBaseUrl: "",
    embeddingDimension: 1536,
    maxTokens: 4096,
    temperature: 0.7,
    features: {
      autoAnalysis: true,
      chatEnabled: true,
      planningSuggestions: true,
    },
    rag: {
      topK: 15,
      contextMaxTokens: 12000,
      chatTemperature: 0.1,
      chunkMaxCharsMd: 3000,
      chunkMaxCharsText: 2000,
      chunkOverlapMd: 200,
      chunkRetrievalChars: 6000,
      similarityThreshold: 0.58,
      vectorCandidateMultiplier: 3,
      searchDocType: null,
      searchPathPrefix: null,
      hybridSearchEnabled: true,
      hybridVectorWeight: 0.7,
      hybridKeywordWeight: 0.3,
      multiQueryEnabled: true,
      multiQueryMax: 3,
      hydeEnabled: false,
      requireCitation: true,
      kbRoutingEnabled: true,
      kbRoutingMaxKb: 2,
      llmRerankEnabled: false,
      llmRerankCandidateK: 20,
      llmRerankPreviewChars: 450,
      ragDocTypeStrict: false,
    },
    kbRoutingSystemPrompt: null,
    systemPrompts: null,
  };
}

export function readConfig(): AgentConfigData {
  const d = defaults();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const saved = JSON.parse(raw) as Partial<AgentConfigData>;
      // Security: prefer env var over saved value when the saved key is empty
      // (e.g. agent-config.json intentionally has empty embeddingApiKey to
      // avoid committing real keys to git — see .gitignore).
      const envEmbeddingKey =
        process.env.EMBEDDING_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "";
      const envLlmKey =
        (saved.llmProvider === "anthropic"
          ? process.env.ANTHROPIC_API_KEY
          : process.env.OPENAI_API_KEY) ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY ||
        "";
      return {
        ...d,
        ...saved,
        llmApiKey: saved.llmApiKey || envLlmKey,
        embeddingApiKey: saved.embeddingApiKey || envEmbeddingKey,
        features: { ...d.features, ...(saved.features ?? {}) },
        rag: { ...d.rag, ...(saved.rag ?? {}) },
        systemPrompts:
          saved.systemPrompts !== undefined
            ? normalizeSystemPromptsPatch(saved.systemPrompts)
            : d.systemPrompts,
      };
    }
  } catch {
    // fall through to defaults
  }
  return d;
}

export function writeConfig(config: AgentConfigData): void {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function getPublicConfig(): AgentConfigPublic {
  const cfg = readConfig();
  const { llmApiKey, embeddingApiKey, ...rest } = cfg;
  return {
    ...rest,
    llmApiKeyMasked: maskKey(llmApiKey),
    embeddingApiKeyMasked: maskKey(embeddingApiKey),
  };
}

export function updateConfig(patch: Partial<AgentConfigData>): AgentConfigPublic {
  const current = readConfig();

  // If the user sends back a masked key (didn't change it), keep the stored value
  const updated: AgentConfigData = {
    ...current,
    ...patch,
    // Preserve actual keys if patch contains placeholder masks
    llmApiKey: patch.llmApiKey && !patch.llmApiKey.includes("***")
      ? patch.llmApiKey
      : current.llmApiKey,
    embeddingApiKey: patch.embeddingApiKey && !patch.embeddingApiKey.includes("***")
      ? patch.embeddingApiKey
      : current.embeddingApiKey,
    features: {
      ...current.features,
      ...(patch.features ?? {}),
    },
    rag: {
      ...current.rag,
      ...(patch.rag ?? {}),
    },
    kbRoutingSystemPrompt:
      patch.kbRoutingSystemPrompt !== undefined
        ? (patch.kbRoutingSystemPrompt?.trim() || null)
        : current.kbRoutingSystemPrompt,
    systemPrompts:
      patch.systemPrompts !== undefined
        ? normalizeSystemPromptsPatch(patch.systemPrompts)
        : current.systemPrompts,
  };

  writeConfig(updated);
  return getPublicConfig();
}

// Derive resolved baseUrl for each provider
export function resolveBaseUrl(cfg: AgentConfigData): string | undefined {
  if (cfg.llmBaseUrl) return cfg.llmBaseUrl;
  switch (cfg.llmProvider) {
    case "anthropic": return "https://api.anthropic.com";
    case "openai": return "https://api.openai.com";
    case "ollama": return "http://localhost:11434";
    case "custom": return undefined; // must be provided
    default: return undefined;
  }
}

export function resolveEmbeddingBaseUrl(cfg: AgentConfigData): string {
  return cfg.embeddingBaseUrl || "https://api.openai.com";
}
