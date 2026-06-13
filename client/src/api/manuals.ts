import { http } from './http';

// ==================== Types ====================

export interface OperationManual {
  id: number;
  title: string;
  content: string | null;
  type: string;       // article | document | link
  category: string;   // SOP | FAQ | 操作指南 | 系统说明 | 其他
  tags: string[] | null;
  externalUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  sortOrder: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==================== Constants ====================

export const MANUAL_TYPES = [
  { value: '', label: '全部' },
  { value: 'article', label: '知识文章' },
  { value: 'document', label: '文档' },
  { value: 'link', label: '外链' },
] as const;

// Dynamic color assignment for categories — stable per name
const CATEGORY_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'bg-teal-50 text-teal-700 border-teal-200',
];

export function getCategoryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}

// ==================== API Functions ====================

export async function listManuals(params?: {
  category?: string;
  type?: string;
  search?: string;
}): Promise<OperationManual[]> {
  return http.get('/manuals', params as Record<string, string | number | undefined>);
}

export async function getManual(id: number): Promise<OperationManual> {
  return http.get(`/manuals/${id}`);
}

export async function createManual(data: {
  title: string;
  content?: string;
  type: string;
  category: string;
  tags?: string[];
  externalUrl?: string;
  sortOrder?: number;
}): Promise<OperationManual> {
  return http.post('/manuals', data);
}

export async function uploadManualDoc(data: {
  file: File;
  title: string;
  category: string;
}): Promise<OperationManual> {
  const formData = new FormData();
  formData.append('file', data.file);
  formData.append('title', data.title);
  formData.append('category', data.category);
  const token = localStorage.getItem('token');
  const res = await fetch('/api/v1/manuals/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '上传失败' }));
    throw new Error(err.error || '上传失败');
  }
  return res.json();
}

export async function updateManual(
  id: number,
  data: Partial<{
    title: string;
    content: string;
    category: string;
    tags: string[];
    externalUrl: string;
    sortOrder: number;
  }>
): Promise<OperationManual> {
  return http.put(`/manuals/${id}`, data);
}

export async function deleteManual(id: number): Promise<void> {
  await http.delete(`/manuals/${id}`);
}

export function getManualDownloadUrl(id: number): string {
  return `/api/v1/manuals/download/${id}`;
}

// ==================== Preview ====================

export interface ManualPreview {
  content: string | null;
  mimeType: string;
  fileName: string | null;
  isPdf?: boolean;
  externalUrl?: string;
  message?: string;
}

export async function getManualPreview(id: number): Promise<ManualPreview> {
  return http.get(`/manuals/${id}/preview`);
}

// ==================== Categories ====================

export interface ManualCategory {
  id: number;
  name: string;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export async function listCategories(): Promise<ManualCategory[]> {
  return http.get('/manuals/categories');
}

export async function createCategory(name: string): Promise<ManualCategory> {
  return http.post('/manuals/categories', { name });
}

export async function updateCategory(id: number, name: string): Promise<ManualCategory> {
  return http.put(`/manuals/categories/${id}`, { name });
}

export async function deleteCategory(id: number): Promise<void> {
  await http.delete(`/manuals/categories/${id}`);
}
