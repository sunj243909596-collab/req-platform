// Shared types for the req-platform
// Used by client, server, and agent packages

// ================= Custom Field =================
export interface CustomFieldValue {
  fieldId: number;
  fieldName: string;
  fieldKey: string;
  fieldType: string;
  value: string;
  required: boolean;
  options?: unknown[];
  placeholder?: string;
}

// ================= Auth =================
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: "ADMIN" | "GROUP_LEAD" | "MEMBER";
  groupName: string | null;
  isActive: boolean;
}

// ================= Requirement =================
// 字典表化后，值域由 c_req_type.code 定义，TS 不再硬约束
// 前端下拉框从 /api/v1/req-types 动态加载
export type ReqType = string;
export type Priority = "P0" | "P1" | "P2" | "P3";
export type RelType = "PARENT_CHILD" | "BLOCKS" | "DEPENDS_ON" | "DUPLICATES" | "RELATED";

/** 需求类型字典项（c_req_type） */
export interface RequirementTypeItem {
  id: number;
  code: string;
  displayName: string;
  color: string;
  prefix: string;
  sortOrder: number;
  enabled: boolean;
  /** 已用序列号（GET /req-types/all 返回） */
  currentSeq?: number;
  /** 引用计数：仅 admin 列表（GET /req-types/all）返回，决定 code 字段是否可改 */
  usageCount?: { requirements: number };
}

export interface RequirementCategoryNode {
  id: number;
  name: string;
  code?: string;
  reqType: ReqType;
  parentId?: number;
  sortOrder: number;
  enabled: boolean;
  isRoot: boolean;
  count?: number;
  totalCount?: number;
  children: RequirementCategoryNode[];
}

export interface CreateRequirementCategoryInput {
  name: string;
  parentId: number;
  code?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export type UpdateRequirementCategoryInput = Partial<
  Pick<CreateRequirementCategoryInput, "name" | "code" | "sortOrder" | "enabled"> & {
    parentId: number | null;
  }
>;

export interface CreateRequirementInput {
  reqType?: ReqType;
  /** Optional: provide an explicit requirement number. Used by Excel import;
   *  otherwise the server auto-generates it. Must be unique when set. */
  reqNo?: string;
  categoryId: number;
  title: string;
  module?: string;
  priority: Priority;
  status?: string;
  assignee?: string;
  reporter?: string;
  targetDate?: string;
  terminals?: string[];
  tags?: string[];
  gspImpact?: string;
  relatedTables?: string;
  groupName: string;
  background?: string;
  description?: string;
  designSolution?: string;
  releaseId?: number;
  /** 自定义字段值，格式：[{ fieldId: number, value: string }] */
  customValues?: { fieldId: number; value: string }[];
}

export interface RequirementDetail extends Omit<CreateRequirementInput, "categoryId"> {
  id: number;
  reqNo: string;
  reqType: ReqType;
  categoryId?: number;
  categoryPath?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** 状态颜色(从 group 对应 workflow 的 WorkflowStatus.color 读取,null=未配置) */
  statusColor?: string | null;
  /** 自定义字段值列表 */
  customValues?: CustomFieldValue[];
}

export interface TestCaseStats {
  total: number;       // total test cases count
  passed: number;      // unique test cases with at least one passed run
  failed: number;      // unique test cases where latest run is failed
  regPassRate: number | null; // latest regression pass rate (0-100) or null
  regTotal: number;    // total test cases in regression suite
}

export interface RequirementListItem {
  id: number;
  reqNo: string;
  reqType: ReqType;
  categoryId?: number;
  categoryPath?: string;
  title: string;
  module?: string;
  priority: Priority;
  status: string;
  /** 状态颜色(从 group 对应 workflow 的 WorkflowStatus.color 读取,null=未配置) */
  statusColor?: string | null;
  assignee?: string;
  groupName: string;
  releaseVersion?: string;
  tags?: string[];
  updatedAt: string;
  testStats?: TestCaseStats;
  /** 自定义字段值列表 */
  customValues?: CustomFieldValue[];
}

export type UpdateRequirementInput = Partial<
  Omit<CreateRequirementInput, "groupName">
> & { categoryId?: number };

export interface RequirementQuery extends PaginationQuery {
  search?: string;
  reqType?: ReqType;
  categoryId?: number;
  priority?: Priority;
  status?: string;
  assignee?: string;
  module?: string;
  groupName?: string;
}

export interface GroupInfo {
  id: number;
  groupName: string;
  description: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalRequirements: number;
  inProgress: number;
  pendingReviewReleases: number;
  statusDistribution: { status: string; count: number; statusColor: string | null }[];
  priorityDistribution: { priority: string; count: number }[];
  recentRequirements: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  upcomingReleases: { id: number; releaseName: string; status: string; plannedDate: string | null; reqCount: number }[];
  myAssigned: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  testStats: { totalCases: number; passedCases: number; failedCases: number; passRate: number | null; regressionSuites: number; activeRegressions: number };
}

export interface EffortEstimate {
  totalDays: string;
  breakdown: { category: string; days: string }[];
  confidence: number;
  summary: string;
}

export interface ScheduleSuggestion {
  suggestions: { reqNo: string; title: string; suggestedOrder: number; reason: string }[];
  risks: string[];
  summary: string;
}

export interface ActivityLogEntry {
  id: number;
  reqId: number;
  actor: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  detail: unknown;
  createdAt: string;
}

// ================= Agent =================
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: {
    sources?: SourceReference[];
    toolCalls?: ToolCall[];
    thinking?: string;
  };
}

export interface SourceReference {
  fileName: string;
  section?: string;
  similarity: number;
  content: string;
}

export interface ToolCall {
  name: string;
  params: Record<string, unknown>;
  result?: unknown;
}

export interface ChatRequest {
  conversationId?: number;
  message: string;
}

export interface ChatResponse {
  conversationId: number;
  message: ChatMessage;
  tokensUsed?: number;
}

export interface ConversationInfo {
  id: number;
  title: string | null;
  contextType: string;
  contextId: number | null;
  messageCount: number;
  updatedAt: string;
}

// ================= Agent Analysis =================
export interface AnalysisResult {
  similarRequirements: SimilarRequirement[];
  potentialDuplicates: DuplicateWarning[];
  feasibility: FeasibilityAssessment | null;
  solution: SolutionPreview | null;
}

export interface SimilarRequirement {
  reqId: number;
  reqNo: string;
  title: string;
  priority: string;
  similarity: number;
  status: string;
}

export interface DuplicateWarning {
  reqId: number;
  reqNo: string;
  title: string;
  similarity: number;
  reason: string;
}

export interface FeasibilityAssessment {
  feasible: boolean;
  confidence: number;
  tablesInvolved: string[];
  modulesInvolved: string[];
  estimatedEffortDays: string;
  risks: string[];
  summary: string;
}

export interface SolutionPreview {
  overview: string;
  approach: string;
  keyPoints: string[];
  references: SourceReference[];
}

// ================= Knowledge Base =================
/** 所有已知的 KB docType 字符串 */
export const KB_DOC_TYPES = {
  PRODUCT_DOC: "PRODUCT_DOC",
  MANUAL: "MANUAL",
  CHUNK_DATA: "CHUNK_DATA",
  REQUIREMENT_LIST: "REQUIREMENT_LIST",
} as const;

export type KbDocType = (typeof KB_DOC_TYPES)[keyof typeof KB_DOC_TYPES];

export const KB_DOC_TYPE_LABELS: Record<KbDocType, string> = {
  PRODUCT_DOC: "产品文档(PRD/BRD/FSD)",
  MANUAL: "操作手册",
  CHUNK_DATA: "巴枪端分块",
  REQUIREMENT_LIST: "需求列表与发版计划",
};

export const KB_DOC_TYPE_OPTIONS: { value: KbDocType; label: string }[] = (
  Object.keys(KB_DOC_TYPES) as KbDocType[]
).map((k) => ({ value: k, label: KB_DOC_TYPE_LABELS[k] }));

export interface KnowledgeBaseConfig {
  id?: number;
  name: string;
  displayName: string;
  description?: string;
  basePath: string;
  sourceType?: "directory" | "upload";
  docType?: string;
  enabled: boolean;
}

export interface KnowledgeBaseStatus {
  id: number;
  name: string;
  displayName?: string;
  description?: string | null;
  sourceType: "directory" | "upload";
  docType?: string | null;
  documentCount: number;
  chunkCount: number;
  lastSyncedAt: string | null;
  enabled: boolean;
}

export interface KnowledgeSearchResult {
  content: string;
  fileName: string;
  section?: string;
  similarity: number;
}

// ================= Agent Config =================
export interface RagConfig {
  topK: number;
  contextMaxTokens: number;
  chatTemperature: number;
  chunkMaxCharsMd: number;
  chunkMaxCharsText: number;
  ragDocTypeStrict?: boolean;
}

export interface AgentConfig {
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  embeddingProvider: "openai";
  embeddingModel: string;
  maxTokens: number;
  temperature: number;
  features: {
    autoAnalysis: boolean;
    chatEnabled: boolean;
    planningSuggestions: boolean;
  };
  rag: RagConfig;
}

// ================= Pagination =================
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ================= Excel Import =================
export interface ImportPreviewRow {
  rowNumber: number;
  data: Partial<CreateRequirementInput>;
  status: "valid" | "invalid" | "duplicate";
  errors: string[];
}

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportConfirmInput {
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  successCount: number;
  skipCount: number;
  errors: { rowNumber: number; title: string; error: string }[];
  createdRequirements: { reqNo: string; title: string; id: number }[];
}
