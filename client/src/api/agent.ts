import { http } from './http';

export interface RagRetrievalMeta {
  routing: {
    kbIds: number[];
    labels: string[];
    reason: string;
    method: string;
  };
  rerankMethod?: 'llm' | 'heuristic';
  groundedTableNames?: string[];
  sources: {
    fileName: string;
    section?: string;
    similarity: number;
    preview: string;
    relativePath?: string;
  }[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    rag?: RagRetrievalMeta;
    thinking?: string;
    sources?: { fileName: string; section?: string; similarity: number; content: string }[];
    toolCalls?: unknown[];
  };
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
  similarRequirements: {
    reqId: number;
    reqNo: string;
    title: string;
    priority: string;
    similarity: number;
    status: string;
  }[];
  potentialDuplicates: {
    reqId: number;
    reqNo: string;
    title: string;
    similarity: number;
    reason: string;
  }[];
  feasibility: {
    feasible: boolean;
    confidence: number;
    tablesInvolved: string[];
    modulesInvolved: string[];
    estimatedEffortDays: string;
    risks: string[];
    summary: string;
  } | null;
  solution: {
    overview: string;
    approach: string;
    keyPoints: string[];
    references: unknown[];
  } | null;
}

// === Chat (non-streaming) ===
export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  return http.post('/agent/chat', req);
}

// === Chat (SSE streaming) ===
export function streamChat(
  req: ChatRequest,
  onToken: (text: string) => void,
  onDone: (conversationId: number) => void,
  onError: (err: Error, conversationId?: number) => void,
  onRag?: (meta: RagRetrievalMeta) => void,
  onThinking?: (text: string) => void
): AbortController {
  const controller = new AbortController();
  const token = localStorage.getItem('token');
  // 提到 fetch 外面，以便 .then() 和 .catch() 都能访问
  let convId = 0;

  fetch('/api/v1/agent/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        onError(new Error((body as { error?: string }).error || 'Stream error'));
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) { onError(new Error('No response body')); return; }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const dataLine = line.startsWith('data: ') ? line.slice(6) : line;
          try {
            const evt = JSON.parse(dataLine);
            if (evt.type === 'start') {
              const meta = JSON.parse(evt.content);
              convId = meta.conversationId;
            } else if (evt.type === 'rag' && onRag) {
              onRag(JSON.parse(evt.content) as RagRetrievalMeta);
            } else if (evt.type === 'thinking' && onThinking) {
              onThinking(evt.content);
            } else if (evt.type === 'text') {
              onToken(evt.content);
            } else if (evt.type === 'done') {
              onDone(convId);
            } else if (evt.type === 'error') {
              onError(new Error(evt.content), convId > 0 ? convId : undefined);
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err, convId > 0 ? convId : undefined);
    });

  return controller;
}

// === Analysis ===
export async function analyzeRequirement(reqId: number): Promise<AnalysisResult> {
  return http.post(`/agent/req/${reqId}/analyze`);
}

/** Analyze requirement data BEFORE creating it (draft analysis) */
export async function analyzeRequirementDraft(
  data: { title: string; description?: string; module?: string; terminals?: string[]; relatedTables?: string }
): Promise<AnalysisResult> {
  return http.post(`/agent/analyze-draft`, data);
}

/** Generate design solution from requirement description */
export async function generateDesignSolution(
  data: { title: string; description: string; background?: string; module?: string }
): Promise<{ designSolution: string }> {
  return http.post(`/agent/generate-design`, data);
}

export async function askAboutRequirement(
  reqId: number,
  question: string
): Promise<{ answer: string }> {
  return http.post(`/agent/req/${reqId}/ask`, { question });
}

export async function getRequirementInsights(reqId: number): Promise<unknown[]> {
  return http.get(`/agent/req/${reqId}/insights`);
}

// === Estimation & Scheduling ===
export async function estimateReleaseEffort(releaseId: number): Promise<{
  totalDays: string;
  breakdown: { category: string; days: string }[];
  confidence: number;
  summary: string;
}> {
  return http.post(`/agent/releases/${releaseId}/estimate`);
}

export async function suggestReleaseSchedule(releaseId: number): Promise<{
  suggestions: { reqNo: string; title: string; suggestedOrder: number; reason: string }[];
  risks: string[];
  summary: string;
}> {
  return http.post(`/agent/releases/${releaseId}/suggest`);
}

export async function analyzeDependencies(reqIds: number[]): Promise<unknown> {
  return http.post('/agent/planning/dependencies', { reqIds });
}

// === Conversations ===
export async function getConversations(): Promise<ConversationInfo[]> {
  return http.get('/agent/conversations');
}

export async function getConversationMessages(
  conversationId: number
): Promise<ChatMessage[]> {
  return http.get(`/agent/conversations/${conversationId}`);
}

export async function deleteConversation(
  conversationId: number
): Promise<void> {
  await http.delete(`/agent/conversations/${conversationId}`);
}
