// Agent package entry point
// Re-exports all public APIs

// LLM
export { createLLMProvider, createClaudeProvider, createOpenAIProvider } from "./llm/client";
export type { LLMProvider, LLMConfig, ChatParams, ChatResult, EmbedResult, ToolDef } from "./llm/client";
export { AGENT_TOOLS } from "./llm/tools";
export type { ToolExecutor } from "./llm/tools";
export {
  getSystemPrompt,
  buildKnowledgeContext,
  SYSTEM_PROMPTS,
  RAG_CITATION_SUFFIX,
  type SystemPromptOverrides,
  type SystemPromptContext,
} from "./llm/prompts";

// RAG
export { chunkDocument, chunkMarkdown, chunkPlainText, chunkCode } from "./rag/chunker";
export type { ChunkResult } from "./rag/chunker";
export { createEmbedder, cosineSimilarity } from "./rag/embedder";
export type { Embedder } from "./rag/embedder";
export type { RetrievedChunk } from "./rag/retriever";
export { rerank } from "./rag/reranker";
export { expandSearchQueries } from "./rag/query-expand";
export { mergeHybridChunks, mergeMultiQueryChunks } from "./rag/hybrid";
export type { ScoredChunk, RetrievalSource } from "./rag/hybrid";
export { extractGroundedTableNames, buildTableGroundingBlock } from "./rag/table-grounding";

// Knowledge
export { scanDirectory, computeDelta, sha256 } from "./knowledge/scanner";
export type { ScannedFile } from "./knowledge/scanner";
export { indexKnowledgeBase } from "./knowledge/indexer";
export type { IndexProgress } from "./knowledge/indexer";

// Conversation
export { ConversationManager } from "./conversation/manager";
export type { ConversationConfig, ConversationContext } from "./conversation/manager";

// Analysis
export { findSimilarRequirements } from "./analysis/similar";
export type { SimilarReqResult } from "./analysis/similar";
export { detectDuplicates } from "./analysis/duplicate";
export type { DuplicateWarning } from "./analysis/duplicate";
export { assessFeasibility } from "./analysis/feasibility";
export type { FeasibilityInput } from "./analysis/feasibility";
export { generateSolution } from "./analysis/solution";
export type { SolutionInput } from "./analysis/solution";

// Planning
export { estimateEffort } from "./planning/estimator";
export type { EstimationInput, EffortEstimate } from "./planning/estimator";
export { suggestSchedule, analyzeDependencies } from "./planning/scheduler";
export type { SchedulerInput, ScheduleSuggestion, DependencyResult } from "./planning/scheduler";
