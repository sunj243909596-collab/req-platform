// Conversation context manager
// Sliding window with summarization at 3 levels

import type { ChatMessage } from "shared-types";
import type { LLMProvider } from "../llm/client";

export interface ConversationContext {
  /** The system prompt to use */
  systemPrompt: string;
  /** Messages in the context window */
  messages: ChatMessage[];
  /** Total tokens in the context */
  tokenCount: number;
}

export interface ConversationConfig {
  maxContextTokens: number;
  recentMessageCount: number;
  summaryThreshold: number;       // message count before summarizing
  persistentSummaryThreshold: number; // message count for persistent summary
}

const DEFAULT_CONFIG: ConversationConfig = {
  maxContextTokens: 6000,
  recentMessageCount: 10,
  summaryThreshold: 30,
  persistentSummaryThreshold: 50,
};

export class ConversationManager {
  private config: ConversationConfig;
  private llm: LLMProvider;

  constructor(llm: LLMProvider, config?: Partial<ConversationConfig>) {
    this.llm = llm;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Build the context window for a conversation */
  async buildContext(
    messages: ChatMessage[],
    systemPrompt: string,
    persistentSummary?: string
  ): Promise<ConversationContext> {
    if (messages.length === 0) {
      return {
        systemPrompt,
        messages: [],
        tokenCount: await this.llm.countTokens(systemPrompt),
      };
    }

    const totalTokens = await this.estimateTotalTokens(systemPrompt, messages);

    // Level 1: Everything fits
    if (totalTokens <= this.config.maxContextTokens) {
      return { systemPrompt, messages, tokenCount: totalTokens };
    }

    // Level 2: Keep recent + summarize older
    const recentMessages = messages.slice(-this.config.recentMessageCount);
    const olderMessages = messages.slice(0, -this.config.recentMessageCount);

    if (messages.length <= this.config.persistentSummaryThreshold) {
      const summary = await this.summarizeMessages(olderMessages);
      const summaryMsg: ChatMessage = {
        role: "system",
        content: `[历史对话摘要]\n${summary}`,
        metadata: { thinking: "auto-summary" },
      };

      const contextMessages = [summaryMsg, ...recentMessages];
      const contextTokens = await this.estimateTotalTokens(systemPrompt, contextMessages);

      return { systemPrompt, messages: contextMessages, tokenCount: contextTokens };
    }

    // Level 3: Persistent running summary
    const prevSummary = persistentSummary || await this.summarizeMessages(olderMessages);
    const newMessagesForSummary = olderMessages.slice(-10); // summarize incremental
    const incrementalSummary = await this.summarizeMessages(newMessagesForSummary);
    const combinedSummary = prevSummary + "\n" + incrementalSummary;

    const summaryMsg: ChatMessage = {
      role: "system",
      content: `[对话摘要]\n${combinedSummary}`,
      metadata: { thinking: "persistent-summary" },
    };

    const contextMessages = [summaryMsg, ...recentMessages];
    const contextTokens = await this.estimateTotalTokens(systemPrompt, contextMessages);

    return { systemPrompt, messages: contextMessages, tokenCount: contextTokens };
  }

  private async summarizeMessages(messages: ChatMessage[]): Promise<string> {
    if (messages.length === 0) return "";

    const userMessages = messages.filter(m => m.role === "user");
    if (userMessages.length === 0) return "";

    // For 3 or fewer messages, truncation is sufficient
    if (userMessages.length <= 3) {
      return userMessages
        .map(m => m.content.slice(0, 100) + (m.content.length > 100 ? "..." : ""))
        .join("; ");
    }

    // For longer conversations, use LLM to generate a real summary
    try {
      const conversationText = messages
        .map(m => `[${m.role === "user" ? "用户" : "助手"}]: ${m.content}`)
        .join("\n");
      const result = await this.llm.chat({
        systemPrompt: "你是一个对话摘要助手。将以下对话压缩为一段简短摘要（200字内），保留关键事实、决策和代码细节。只输出摘要文本，不要加标题或前缀。",
        messages: [{ role: "user", content: conversationText }],
        temperature: 0.1,
        maxTokens: 200,
      });
      const summary = result.content.trim();
      if (summary) return summary;
    } catch {
      // LLM summarization failed, fall back to truncation
    }

    // Fallback: simple truncation
    return userMessages
      .map(m => m.content.slice(0, 100) + (m.content.length > 100 ? "..." : ""))
      .join("; ");
  }

  private async estimateTotalTokens(systemPrompt: string, messages: ChatMessage[]): Promise<number> {
    let total = await this.llm.countTokens(systemPrompt);
    for (const msg of messages) {
      total += await this.llm.countTokens(msg.content);
    }
    return total;
  }

  /** Generate a title for a new conversation */
  async generateTitle(firstMessage: string): Promise<string> {
    const truncated = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    return `对话: ${truncated}`;
  }
}
