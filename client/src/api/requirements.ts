import { http } from './http';

// Shared types — mirrored from backend Prisma schema
export type ReqType = 'REQUIREMENT' | 'BUG' | 'IMPROVEMENT' | 'TASK';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

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

export interface CreateRequirementInput {
  reqType?: ReqType;
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
  customValues?: { fieldId: number; value: string }[];
}

export interface RequirementDetail extends CreateRequirementInput {
  id: number;
  reqNo: string;
  reqType: ReqType;
  categoryPath?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** 状态颜色(从 group 对应 workflow 的 WorkflowStatus.color 读取) */
  statusColor?: string | null;
  customValues?: CustomFieldValue[];
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
  /** 状态颜色(从 group 对应 workflow 的 WorkflowStatus.color 读取) */
  statusColor?: string | null;
  assignee?: string;
  groupName: string;
  releaseVersion?: string;
  tags?: string[];
  updatedAt: string;
  customValues?: CustomFieldValue[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RequirementQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  reqType?: ReqType;
  categoryId?: number;
  priority?: Priority;
  status?: string;
  assignee?: string;
  module?: string;
  groupName?: string;
  releaseId?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface RequirementView {
  id: number;
  userId: number;
  name: string;
  filters: RequirementQuery;
  sortBy?: string;
  sortOrder?: string;
  isDefault: boolean;
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

export async function listRequirements(
  query: RequirementQuery = {}
): Promise<PaginatedResponse<RequirementListItem>> {
  const params = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '')
  ) as Record<string, string | number>;
  return http.get('/requirements', params);
}

/** Get category counts for current filters (for sidebar display) */
export async function getCategoryCounts(
  query: RequirementQuery = {}
): Promise<{ categoryCounts: { categoryId: number; count: number }[] }> {
  const params = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '')
  ) as Record<string, string | number>;
  return http.get('/requirements/category-counts', params);
}

/** Get distinct status values that actually exist in the DB (for filter dropdown) */
export async function getDistinctStatuses(): Promise<string[]> {
  const data = await http.get<{ statuses: string[] }>('/requirements/distinct-statuses');
  return data.statuses;
}

/** Get module enum options for dropdown */
export async function getModuleOptions(): Promise<string[]> {
  const data = await http.get<{ options: string[] }>('/config/module-options');
  return data.options;
}

/** Update module enum options (ADMIN only) */
export async function updateModuleOptions(options: string[]): Promise<void> {
  await http.put('/config/module-options', { options });
}

export async function getRequirement(id: number): Promise<RequirementDetail> {
  return http.get(`/requirements/${id}`);
}

export async function createRequirement(
  input: CreateRequirementInput
): Promise<RequirementDetail> {
  return http.post('/requirements', input);
}

export async function updateRequirement(
  id: number,
  input: Partial<CreateRequirementInput>
): Promise<RequirementDetail> {
  return http.put(`/requirements/${id}`, input);
}

export async function deleteRequirement(id: number): Promise<void> {
  await http.delete(`/requirements/${id}`);
}

export async function batchDeleteRequirements(ids: number[]): Promise<{ ok: boolean; deleted: number }> {
  return http.post('/requirements/batch-delete', { ids });
}

// ====== 回收站 ======

export interface TrashItem {
  id: number;
  reqNo: string;
  title: string;
  reqType: string;
  reqTypeDisplay: string;
  categoryPath?: string;
  groupName: string;
  priority: string;
  status: string;
  assignee?: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface TrashListResult {
  total: number;
  page: number;
  pageSize: number;
  items: TrashItem[];
}

export async function listTrashRequirements(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  deletedBy?: string;
}): Promise<TrashListResult> {
  return http.get('/requirements/trash', params as Record<string, string | number | undefined>);
}

export async function restoreRequirement(id: number): Promise<void> {
  await http.post(`/requirements/${id}/restore`);
}

export async function permanentlyDeleteRequirement(id: number): Promise<void> {
  await http.delete(`/requirements/${id}/permanent`);
}

export async function batchRestoreRequirements(ids: number[]): Promise<{ ok: boolean; restored: number }> {
  return http.post('/requirements/trash/batch-restore', { ids });
}

export async function batchPermanentlyDeleteRequirements(ids: number[]): Promise<{ ok: boolean; deleted: number }> {
  return http.post('/requirements/trash/batch-permanent-delete', { ids });
}

/** Transition requirement status with optional assignee + comment */
export async function transitionRequirement(
  id: number,
  input: { status: string; assignee?: string; comment?: string }
): Promise<{ ok: boolean; oldStatus: string; newStatus: string; assignee: string }> {
  return http.post(`/requirements/${id}/transition`, input);
}

export async function getRequirementHistory(id: number): Promise<ActivityLogEntry[]> {
  return http.get(`/requirements/${id}/history`);
}

export async function getDashboardStats(): Promise<{
  totalRequirements: number;
  inProgress: number;
  pendingReviewReleases: number;
  statusDistribution: { status: string; count: number; statusColor: string | null }[];
  priorityDistribution: { priority: string; count: number }[];
  recentRequirements: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  upcomingReleases: { id: number; releaseName: string; status: string; plannedDate: string | null; reqCount: number }[];
  myAssigned: { id: number; reqNo: string; title: string; status: string; priority: string; updatedAt: string; statusColor: string | null }[];
  testStats: { totalCases: number; passedCases: number; failedCases: number; passRate: number | null; regressionSuites: number; activeRegressions: number };
}> {
  return http.get('/stats/dashboard');
}

export interface HeatmapCell {
  date: string;
  count: number;
  uncompleted: number;
}

export interface HeatmapCategory {
  id: number;
  name: string;
  total: number;
  weeks: HeatmapCell[];
}

export interface CategoryHeatmap {
  weekStartDates: string[];
  categories: HeatmapCategory[];
  maxCount: number;
}

export async function getCategoryHeatmap(weeks = 6): Promise<CategoryHeatmap> {
  return http.get('/stats/category-heatmap', { weeks });
}

// ==================== Custom Views ====================

export async function listViews(): Promise<RequirementView[]> {
  return http.get('/requirements/views');
}

export async function createView(input: {
  name: string;
  filters: RequirementQuery;
  sortBy?: string;
  sortOrder?: string;
  isDefault?: boolean;
}): Promise<RequirementView> {
  return http.post('/requirements/views', input);
}

export async function updateView(id: number, data: Partial<{
  name: string;
  filters: RequirementQuery;
  sortBy: string;
  sortOrder: string;
  isDefault: boolean;
}>): Promise<void> {
  await http.put(`/requirements/views/${id}`, data);
}

export async function deleteView(id: number): Promise<void> {
  await http.delete(`/requirements/views/${id}`);
}

// ==================== Excel Import ====================

export interface ImportPreviewRow {
  rowNumber: number;
  data: Partial<CreateRequirementInput> & { categoryId?: number; reqNo?: string };
  status: 'valid' | 'invalid' | 'duplicate';
  errors: string[];
}

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportResult {
  successCount: number;
  skipCount: number;
  errors: { rowNumber: number; title: string; error: string }[];
  createdRequirements: { reqNo: string; title: string; id: number }[];
}

/** Download the Excel import template */
export async function downloadImportTemplate() {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/v1/requirements/import/template', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('下载模板失败');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'requirement-import-template.xlsx';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/** Preview import: parse Excel and validate rows (no DB writes) */
export async function previewImport(file: File): Promise<ImportPreviewResult> {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/v1/requirements/import/preview', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || '解析失败');
  }

  return res.json();
}

/** Confirm import: re-upload the file; server re-validates and writes valid rows. */
export async function confirmImport(file: File): Promise<ImportResult> {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/v1/requirements/import/confirm', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || '导入失败');
  }

  return res.json();
}

// ==================== Excel Export ====================

export interface ExportFieldDef {
  key: string;
  label: string;
}

/** Get list of all exportable fields */
export async function getExportFields(): Promise<ExportFieldDef[]> {
  return http.get('/requirements/export/fields');
}

/** Export requirements to Excel with selected fields */
export async function exportRequirements(
  fields: string[],
  filters: Record<string, unknown>
): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/v1/requirements/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fields, ...filters }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || '导出失败');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // Extract filename from Content-Disposition header
  const disposition = res.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename="?(.+?)"?(\s*;|$)/);
  a.download = filenameMatch ? filenameMatch[1] : '需求导出.xlsx';

  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
