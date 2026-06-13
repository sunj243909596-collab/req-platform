import { http } from './http';

// ================= Agent Config =================

export type LlmProvider = 'anthropic' | 'openai' | 'ollama' | 'custom';

export interface RagConfig {
  topK: number;
  contextMaxTokens: number;
  chatTemperature: number;
  chunkMaxCharsMd: number;
  chunkMaxCharsText: number;
  chunkOverlapMd: number;
  similarityThreshold: number;
  vectorCandidateMultiplier: number;
  searchDocType?: string | null;
  searchPathPrefix?: string | null;
  hybridSearchEnabled?: boolean;
  hybridVectorWeight?: number;
  hybridKeywordWeight?: number;
  multiQueryEnabled?: boolean;
  multiQueryMax?: number;
  hydeEnabled?: boolean;
  requireCitation?: boolean;
  /** 多知识库时 LLM/启发式先选库再检索 */
  kbRoutingEnabled?: boolean;
  /** 单次最多检索几个知识库 */
  kbRoutingMaxKb?: number;
  llmRerankEnabled?: boolean;
  llmRerankCandidateK?: number;
  llmRerankPreviewChars?: number;
  ragDocTypeStrict?: boolean;
}

export interface AgentConfig {
  llmProvider: LlmProvider;
  llmModel: string;
  llmApiKeyMasked: string;    // masked key returned from server
  llmBaseUrl: string;         // custom endpoint (optional for anthropic/openai)
  embeddingProvider: 'openai';
  embeddingModel: string;
  embeddingApiKeyMasked: string;
  embeddingBaseUrl: string;
  maxTokens: number;
  temperature: number;
  features: {
    autoAnalysis: boolean;
    chatEnabled: boolean;
    planningSuggestions: boolean;
  };
  rag: RagConfig;
  /** 自定义知识库路由系统提示词；null/空表示使用内置默认 */
  kbRoutingSystemPrompt?: string | null;
  /** 对话/分析系统提示词覆盖 */
  systemPrompts?: SystemPromptOverrides | null;
}

export type SystemPromptConfigKey =
  | 'chat'
  | 'ragCitationSuffix'
  | 'requirementAnalysis'
  | 'requirementAssistant'
  | 'releasePlanning'
  | 'solutionGeneration';

export type SystemPromptOverrides = Partial<Record<SystemPromptConfigKey, string | null>>;

export interface AgentConfigUpdate {
  llmProvider?: LlmProvider;
  llmModel?: string;
  llmApiKey?: string;         // plain text when updating
  llmBaseUrl?: string;
  embeddingProvider?: 'openai';
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  features?: {
    autoAnalysis?: boolean;
    chatEnabled?: boolean;
    planningSuggestions?: boolean;
  };
  rag?: RagConfig;
  kbRoutingSystemPrompt?: string | null;
  systemPrompts?: SystemPromptOverrides | null;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  return http.get('/agent/config');
}

export async function updateAgentConfig(config: AgentConfigUpdate): Promise<AgentConfig> {
  return http.put('/agent/config', config);
}

export async function getDefaultKbRoutingPrompt(): Promise<{ default: string }> {
  return http.get('/agent/config/kb-routing-prompt-default');
}

export async function optimizeKbRoutingPrompt(
  currentPrompt?: string | null
): Promise<{ optimized: string }> {
  return http.post('/agent/config/optimize-kb-routing-prompt', {
    currentPrompt: currentPrompt ?? null,
  });
}

export const SYSTEM_PROMPT_LABELS: Record<SystemPromptConfigKey, string> = {
  chat: 'AI 对话主角色',
  ragCitationSuffix: 'RAG 引用与表名约束',
  requirementAnalysis: '需求自动分析',
  requirementAssistant: '需求详情问答',
  releasePlanning: '发版排期建议',
  solutionGeneration: '技术方案生成',
};

export async function getSystemPromptDefaults(): Promise<{
  defaults: Record<SystemPromptConfigKey, string>;
}> {
  return http.get('/agent/config/system-prompt-defaults');
}

export async function optimizeSystemPrompt(
  key: SystemPromptConfigKey,
  currentPrompt?: string | null
): Promise<{ optimized: string }> {
  return http.post('/agent/config/optimize-system-prompt', {
    key,
    currentPrompt: currentPrompt ?? null,
  });
}

export async function testAgentConnection(config: {
  llmProvider: LlmProvider;
  llmModel: string;
  llmApiKey?: string;
  llmBaseUrl?: string;
}): Promise<{ ok: boolean; message: string }> {
  return http.post('/agent/config/test-connection', config);
}

// ================= Knowledge Base =================

export interface KbRoutingExample {
  question: string;
  kbIds: number[];
  note?: string;
}

export interface KbRoutingTestResult {
  kbIds: number[];
  labels: string[];
  reason: string;
  method: 'llm' | 'heuristic' | 'single' | 'configured' | 'default' | 'docType';
  catalogPreview?: string;
}

export interface KnowledgeBaseStatus {
  id: number;
  name: string;
  displayName?: string;
  description?: string | null;
  routingExamples?: KbRoutingExample[] | null;
  sourceType: "directory" | "upload";
  docType?: string | null;
  documentCount: number;
  chunkCount: number;
  lastSyncedAt: string | null;
  enabled: boolean;
}

export interface CreateKnowledgeBaseInput {
  name: string;
  displayName: string;
  description?: string;
  routingExamples?: KbRoutingExample[] | null;
  basePath: string;
  sourceType?: "directory" | "upload";
  docType?: string;
  enabled?: boolean;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseStatus[]> {
  return http.get('/knowledge/bases');
}

export async function createKnowledgeBase(
  input: CreateKnowledgeBaseInput
): Promise<KnowledgeBaseStatus> {
  return http.post('/knowledge/bases', input);
}

export async function updateKnowledgeBase(
  id: number,
  input: Partial<CreateKnowledgeBaseInput>
): Promise<void> {
  await http.put(`/knowledge/bases/${id}`, input);
}

export async function deleteKnowledgeBase(id: number): Promise<void> {
  await http.delete(`/knowledge/bases/${id}`);
}

/** 手动触发"需求列表" RAG KB 全量重建(管理员) */
export async function rebuildRequirementKb(): Promise<{ ok: boolean; indexed: number; failed: number }> {
  return http.post('/knowledge/requirement-kb/rebuild', {});
}

export async function syncKnowledgeBase(id: number): Promise<{
  ok: boolean;
  documents?: number;
  chunks?: number;
  error?: string;
}> {
  return http.post(`/knowledge/bases/${id}/sync`);
}

export interface KbSyncJob {
  id: string;
  kbId: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message: string;
  documents?: number;
  chunks?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** 异步同步：立即返回 jobId */
export async function syncKnowledgeBaseAsync(id: number): Promise<{
  ok: boolean;
  async?: boolean;
  jobId?: string;
  error?: string;
}> {
  return http.post(`/knowledge/bases/${id}/sync?async=1`);
}

export async function getKbSyncJob(jobId: string): Promise<KbSyncJob> {
  return http.get(`/knowledge/sync/jobs/${jobId}`);
}

/** Upload files to a knowledge base (upload mode) */
export async function uploadKnowledgeFiles(
  kbId: number,
  files: File[]
): Promise<{ ok: boolean; documents?: number; chunks?: number; uploadedFiles?: string[]; error?: string }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  // Get token for auth
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`/api/v1/knowledge/bases/${kbId}/upload`, {
    method: "POST",
    headers,
    body: formData,
  });

  return response.json();
}

export async function getKnowledgeBaseStatus(
  id: number
): Promise<KnowledgeBaseStatus> {
  return http.get(`/knowledge/bases/${id}/status`);
}

/** 路由测试：预览问题会选中哪些知识库（不检索分块） */
export async function testKbRouting(question: string): Promise<KbRoutingTestResult> {
  return http.post('/knowledge/route-test', { q: question });
}

// ================= Custom Fields =================

export interface CustomField {
  id: number;
  groupId?: number;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  options?: unknown[];
  required: boolean;
  sortOrder: number;
  placeholder?: string;
}

/** 获取全局自定义字段列表 */
export async function listCustomFields(): Promise<CustomField[]> {
  return http.get('/groups/fields');
}

/** 创建全局自定义字段 */
export async function createCustomField(
  input: { fieldName: string; fieldKey: string; fieldType: string; options?: unknown[]; required?: boolean; sortOrder?: number; placeholder?: string }
): Promise<CustomField> {
  return http.post('/groups/fields', input);
}

export async function updateCustomField(
  id: number,
  input: Partial<CustomField>
): Promise<void> {
  await http.put(`/groups/fields/${id}`, input);
}

export async function deleteCustomField(id: number): Promise<void> {
  await http.delete(`/groups/fields/${id}`);
}

// ================= Workflow Config =================

export interface WorkflowConfig {
  id: number;
  groupId: number;
  statusList: string[];
  transitions: { from: string; to: string }[];
}

/** Get workflow transitions for a group by group name (used in requirement edit page) */
export async function getWorkflowTransitions(groupId: number, workflowId: number): Promise<Array<{ from: string; to: string }>> {
  const data = await http.get<{ transitions: Array<{ from: string; to: string }> }>(`/workflows/${workflowId}/transitions`);
  return data.transitions;
}

// ── New Workflow Designer API ──

export interface WorkflowDefinition {
  id: number;
  name: string;
  description?: string;
  enabled: boolean;
  groupId: number;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  _count?: { statuses: number; transitions: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStatus {
  id: number;
  workflowId: number;
  name: string;
  sortOrder: number;
  isStart: boolean;
  isEnd: boolean;
  color?: string;
}

export interface WorkflowTransition {
  id: number;
  workflowId: number;
  fromStatusId: number;
  toStatusId: number;
  enabled: boolean;
}

export async function listWorkflows(groupId?: number): Promise<WorkflowDefinition[]> {
  return http.get('/workflows', groupId ? { groupId } : undefined);
}

export async function getWorkflow(id: number): Promise<WorkflowDefinition> {
  return http.get(`/workflows/${id}`);
}

export async function createWorkflow(input: { name: string; description?: string; groupId: number }): Promise<WorkflowDefinition> {
  return http.post('/workflows', input);
}

export async function updateWorkflow(id: number, input: { name?: string; description?: string; enabled?: boolean }): Promise<WorkflowDefinition> {
  return http.put(`/workflows/${id}`, input);
}

export async function deleteWorkflow(id: number): Promise<void> {
  await http.delete(`/workflows/${id}`);
}

export async function updateWorkflowStatuses(workflowId: number, statuses: Array<{
  id?: number; name: string; sortOrder?: number; isStart?: boolean; isEnd?: boolean; color?: string;
}>): Promise<WorkflowDefinition> {
  return http.put(`/workflows/${workflowId}/statuses`, { statuses });
}

export async function updateWorkflowTransitions(workflowId: number, transitions: Array<{
  fromStatusId: number; toStatusId: number;
}>): Promise<WorkflowDefinition> {
  return http.put(`/workflows/${workflowId}/transitions`, { transitions });
}

// ==================== Knowledge Base File ====================

/** Get content of a knowledge base file by relativePath */
export async function getKbFileContent(relativePath: string): Promise<{ content: string; fileName: string; relativePath: string }> {
  return http.get('/knowledge/file', { path: relativePath });
}
