import { http } from './http';

// ================= SubTask =================

export interface SubTask {
  id: number;
  reqId: number;
  taskNo: string;
  title: string;
  description: string | null;
  assignee: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export async function listSubTasks(reqId: number): Promise<SubTask[]> {
  return http.get(`/collaboration/${reqId}/subtasks`);
}

export async function createSubTask(
  reqId: number,
  input: { title: string; description?: string; assignee?: string; status?: string }
): Promise<SubTask> {
  return http.post(`/collaboration/${reqId}/subtasks`, input);
}

export async function updateSubTask(
  id: number,
  input: { title?: string; description?: string; assignee?: string; status?: string; sortOrder?: number }
): Promise<SubTask> {
  return http.put(`/collaboration/subtasks/${id}`, input);
}

export async function deleteSubTask(id: number): Promise<void> {
  await http.delete(`/collaboration/subtasks/${id}`);
}

// ================= Comment =================

export interface Comment {
  id: number;
  reqId: number;
  author: string;
  content: string;
  isMention: boolean;
  createdAt: string;
}

export async function listComments(reqId: number): Promise<Comment[]> {
  return http.get(`/collaboration/${reqId}/comments`);
}

export async function createComment(
  reqId: number,
  content: string
): Promise<Comment> {
  return http.post(`/collaboration/${reqId}/comments`, { content });
}

export async function deleteComment(id: number): Promise<void> {
  await http.delete(`/collaboration/comments/${id}`);
}

// ================= ReqRelation =================

export interface RequirementRef {
  id: number;
  reqNo: string;
  title: string;
  status: string;
}

export interface Relation {
  id: number;
  fromReqId: number;
  toReqId: number;
  relType: string;
  createdAt: string;
  toReq?: RequirementRef;
  fromReq?: RequirementRef;
}

export interface RelationsResponse {
  outgoing: Relation[];
  incoming: Relation[];
}

export const REL_TYPE_LABELS: Record<string, string> = {
  PARENT_CHILD: '父子',
  BLOCKS: '阻塞',
  DEPENDS_ON: '依赖',
  DUPLICATES: '重复',
  RELATED: '相关',
};

export async function listRelations(reqId: number): Promise<RelationsResponse> {
  return http.get(`/collaboration/${reqId}/relations`);
}

export async function createRelation(
  reqId: number,
  input: { toReqId: number; relType: string }
): Promise<Relation> {
  return http.post(`/collaboration/${reqId}/relations`, input);
}

export async function deleteRelation(id: number): Promise<void> {
  await http.delete(`/collaboration/relations/${id}`);
}

export async function searchRequirements(
  query: string,
  limit = 10
): Promise<RequirementRef[]> {
  return http.get('/collaboration/search', { q: query, limit });
}

// ================= Attachment =================

export interface Attachment {
  id: number;
  reqId: number;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  mimeType: string | null;
  uploadedBy: string;
  createdAt: string;
}

export async function listAttachments(reqId: number): Promise<Attachment[]> {
  return http.get(`/collaboration/${reqId}/attachments`);
}

export async function uploadAttachment(
  reqId: number,
  file: File
): Promise<Attachment> {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`/api/v1/collaboration/${reqId}/attachments`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || '上传失败');
  }

  return res.json();
}

export function getAttachmentDownloadUrl(id: number): string {
  return `/api/v1/collaboration/attachments/${id}/download`;
}

export async function deleteAttachment(id: number): Promise<void> {
  await http.delete(`/collaboration/attachments/${id}`);
}

// ================= Document =================

export interface Document {
  id: number;
  reqId: number;
  docName: string;
  docPath: string | null;
  docType: string | null;
  createdAt: string;
  ragIndexed?: boolean; // Whether this document is indexed into RAG KB
}

export async function listDocuments(reqId: number): Promise<Document[]> {
  return http.get(`/collaboration/${reqId}/documents`);
}

export async function createDocument(
  reqId: number,
  input: { docName: string; docType: string; docPath?: string }
): Promise<Document> {
  return http.post(`/collaboration/${reqId}/documents`, input);
}

export async function deleteDocument(id: number): Promise<void> {
  await http.delete(`/collaboration/documents/${id}`);
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  BRD: "BRD (业务需求文档)",
  FSD: "FSD (功能需求文档)",
  "数据模型设计": "数据模型设计",
  PRD: "PRD (产品设计文档)",
  其他: "其他",
};

export interface DocumentPreview {
  isExternal: boolean;
  content: string | null;
  mimeType: string;
  fileName: string;
  docType: string;
  url?: string;
}

/** Upload MD/HTML file to a requirement's documents */
export async function uploadDocument(
  reqId: number,
  file: File,
  docType: string
): Promise<Document> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", file);
  formData.append("docType", docType);

  const res = await fetch(`/api/v1/collaboration/${reqId}/documents/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "上传失败");
  }

  return res.json();
}

/** Fetch document content for preview */
export async function getDocumentPreview(id: number): Promise<DocumentPreview> {
  return http.get(`/collaboration/documents/${id}/preview`);
}

/** Re-index a document into RAG knowledge base */
export async function reindexDocument(id: number): Promise<{ ok: boolean; chunks: number }> {
  return http.post(`/collaboration/documents/${id}/reindex`);
}

/** Get RAG knowledge base stats */
export interface RagKbStats {
  id: number;
  name: string;
  docCount: number;
  chunkCount: number;
  lastSyncedAt: string | null;
}

export async function getRagStats(): Promise<RagKbStats[]> {
  return http.get("/collaboration/rag-stats");
}

// ================= Test Case =================

export interface TestCaseStep {
  step: number;
  action: string;
  expected: string;
}

export interface TestCase {
  id: number;
  reqId: number;
  caseNo: string;
  title: string;
  precondition: string | null;
  steps: TestCaseStep[];
  priority: string;
  source: "AI" | "manual";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export async function listTestCases(reqId: number): Promise<TestCase[]> {
  return http.get(`/collaboration/${reqId}/test-cases`);
}

export async function createTestCase(
  reqId: number,
  input: { title: string; precondition?: string; steps: TestCaseStep[]; priority?: string }
): Promise<TestCase> {
  return http.post(`/collaboration/${reqId}/test-cases`, input);
}

export async function updateTestCase(
  id: number,
  input: { title?: string; precondition?: string; steps?: TestCaseStep[]; priority?: string; caseNo?: string }
): Promise<TestCase> {
  return http.put(`/collaboration/test-cases/${id}`, input);
}

export async function deleteTestCase(id: number): Promise<void> {
  await http.delete(`/collaboration/test-cases/${id}`);
}

export async function deleteAllTestCases(reqId: number): Promise<{ ok: boolean; deleted: number }> {
  return http.delete(`/collaboration/${reqId}/test-cases`);
}

export const PRIORITY_LABELS: Record<string, string> = {
  P0: "P0 紧急",
  P1: "P1 高",
  P2: "P2 中",
  P3: "P3 低",
};

// ================= Test Run =================

export interface TestRun {
  id: number;
  testCaseId: number;
  status: "pending" | "passed" | "failed" | "blocked";
  result: string | null;
  screenshots: string[] | null;
  createdBy: string;
  createdAt: string;
}

export async function listTestRuns(testCaseId: number): Promise<TestRun[]> {
  return http.get(`/collaboration/test-cases/${testCaseId}/runs`);
}

export async function createTestRun(
  testCaseId: number,
  data: { status: string; result?: string; screenshots?: File[] }
): Promise<TestRun> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  formData.append("status", data.status);
  if (data.result) formData.append("result", data.result);
  if (data.screenshots) {
    data.screenshots.forEach((f) => formData.append("screenshots", f));
  }

  const res = await fetch(`/api/v1/collaboration/test-cases/${testCaseId}/runs`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "提交失败");
  }
  return res.json();
}

export async function deleteTestRun(id: number): Promise<void> {
  await http.delete(`/collaboration/test-runs/${id}`);
}

export function getScreenshotUrl(relativePath: string): string {
  return `/api/v1/${relativePath}`;
}

// ================= Regression Suite =================

export interface RegressionSuiteItem {
  id: number;
  testCaseId: number;
  sortOrder: number;
  testCase: { id: number; caseNo: string; title: string; priority: string };
}

export interface RegressionSuite {
  id: number;
  reqId: number;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: RegressionSuiteItem[];
  latestRun: { id: number; passCount: number; failCount: number; totalCount: number; status: string; createdAt: string } | null;
}

export async function listRegressionSuites(reqId: number): Promise<RegressionSuite[]> {
  return http.get(`/collaboration/${reqId}/regression-suites`);
}

export async function createRegressionSuite(reqId: number, data: { name: string; description?: string; testCaseIds: number[] }): Promise<RegressionSuite> {
  return http.post(`/collaboration/${reqId}/regression-suites`, data);
}

export async function deleteRegressionSuite(id: number): Promise<void> {
  await http.delete(`/collaboration/regression-suites/${id}`);
}

export async function updateRegressionSuite(id: number, data: { name?: string; description?: string; testCaseIds?: number[] }): Promise<void> {
  await http.put(`/collaboration/regression-suites/${id}`, data);
}

// ================= Regression Run =================

export interface RegressionRunItem {
  id: number;
  runId: number;
  testCaseId: number;
  status: string;
  result: string | null;
  screenshots: string[] | null;
  createdAt: string;
  testCase: { id: number; caseNo: string; title: string; priority: string };
}

export interface RegressionRun {
  id: number;
  suiteId: number;
  totalCount: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
  status: string;
  createdBy: string;
  createdAt: string;
  items: RegressionRunItem[];
}

export async function createRegressionRun(suiteId: number): Promise<RegressionRun> {
  return http.post(`/collaboration/regression-suites/${suiteId}/runs`);
}

export async function getRegressionRun(runId: number): Promise<RegressionRun> {
  return http.get(`/collaboration/regression-runs/${runId}`);
}

export async function updateRegressionRunItem(itemId: number, data: { status: string; result?: string }): Promise<void> {
  await http.put(`/collaboration/regression-run-items/${itemId}`, data);
}

export async function uploadRegressionScreenshots(itemId: number, screenshots: File[]): Promise<{ screenshots: string[] }> {
  const token = localStorage.getItem("token");
  const formData = new FormData();
  screenshots.forEach(f => formData.append("screenshots", f));
  const res = await fetch(`/api/v1/collaboration/regression-run-items/${itemId}/screenshots`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || "上传失败");
  }
  return res.json();
}
