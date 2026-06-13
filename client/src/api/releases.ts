import { http } from './http';

export interface ReleaseInfo {
  id: number;
  versionNo: string;
  releaseName: string;
  status: 'PLANNED' | 'IN_DEV' | 'IN_REVIEW' | 'RELEASED' | 'CLOSED' | 'CANCELLED';
  groupName: string;
  owner?: string;
  plannedDate?: string;
  actualDate?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseListQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  groupName?: string;
}

export async function listReleases(query: ReleaseListQuery = {}) {
  const params = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '')
  ) as Record<string, string | number>;
  return http.get<{ data: ReleaseInfo[]; total: number; page: number; pageSize: number }>(
    '/releases',
    params
  );
}

export async function getRelease(id: number): Promise<ReleaseInfo> {
  return http.get(`/releases/${id}`);
}

export async function createRelease(input: {
  versionNo: string;
  releaseName: string;
  status?: string;
  groupName: string;
  owner?: string;
  plannedDate?: string;
  description?: string;
  requirementIds?: number[];
}): Promise<ReleaseInfo> {
  return http.post('/releases', input);
}

export async function updateRelease(
  id: number,
  input: Partial<ReleaseInfo>
): Promise<ReleaseInfo> {
  return http.put(`/releases/${id}`, input);
}

export async function deleteRelease(id: number): Promise<void> {
  await http.delete(`/releases/${id}`);
}

export async function submitReleaseForReview(id: number): Promise<ReleaseInfo> {
  return http.post(`/releases/${id}/submit-review`);
}

export async function reviewRelease(
  id: number,
  action: 'APPROVED' | 'REJECTED',
  comment?: string
): Promise<ReleaseInfo> {
  return http.post(`/releases/${id}/review`, { action, comment });
}

// Get requirements associated with a release
export async function getReleaseRequirements(releaseId: number) {
  return http.get('/requirements', { releaseId, pageSize: 100 });
}

// Add requirements to a release
export async function addRequirementsToRelease(
  releaseId: number,
  requirementIds: number[]
): Promise<{ ok: boolean; count: number }> {
  return http.post(`/releases/${releaseId}/requirements`, { requirementIds });
}

// Remove a requirement from a release
export async function removeRequirementFromRelease(
  releaseId: number,
  reqId: number
): Promise<void> {
  await http.delete(`/releases/${releaseId}/requirements/${reqId}`);
}

// Get unassigned requirements (for selection)
export async function getUnassignedRequirements(
  releaseId: number,
  groupName?: string
): Promise<{ id: number; reqNo: string; title: string; priority: string; status: string }[]> {
  return http.get('/releases/unassigned-requirements', { releaseId, groupName });
}
