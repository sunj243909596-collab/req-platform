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
export type ReqType = "REQUIREMENT" | "BUG" | "IMPROVEMENT" | "TASK";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type RelType = "PARENT_CHILD" | "BLOCKS" | "DEPENDS_ON" | "DUPLICATES" | "RELATED";
export interface CreateRequirementInput {
    reqType: ReqType;
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
}
export interface RequirementDetail extends CreateRequirementInput {
    id: number;
    reqNo: string;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface RequirementListItem {
    id: number;
    reqNo: string;
    reqType: ReqType;
    title: string;
    module?: string;
    priority: Priority;
    status: string;
    assignee?: string;
    groupName: string;
    releaseVersion?: string;
    tags?: string[];
    updatedAt: string;
}
export type UpdateRequirementInput = Partial<Omit<CreateRequirementInput, "groupName">>;
export interface RequirementQuery extends PaginationQuery {
    search?: string;
    reqType?: ReqType;
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
}
export interface EffortEstimate {
    totalDays: string;
    breakdown: {
        category: string;
        days: string;
    }[];
    confidence: number;
    summary: string;
}
export interface ScheduleSuggestion {
    suggestions: {
        reqNo: string;
        title: string;
        suggestedOrder: number;
        reason: string;
    }[];
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
    sourceType: "directory" | "upload";
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
export interface RagConfig {
    topK: number;
    contextMaxTokens: number;
    chatTemperature: number;
    chunkMaxCharsMd: number;
    chunkMaxCharsText: number;
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
//# sourceMappingURL=index.d.ts.map