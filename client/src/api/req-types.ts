import { http } from './http';
import type { RequirementTypeItem } from '../../../packages/shared-types/src/index';

/** 公共：已登录用户都能拉，启用的类型（下拉框/徽标用） */
export async function listRequirementTypes(): Promise<RequirementTypeItem[]> {
  return http.get('/req-types');
}

/** admin：全量（含 disabled） */
export async function listAllRequirementTypes(): Promise<RequirementTypeItem[]> {
  return http.get('/req-types/all');
}

export type CreateRequirementTypeInput = Omit<RequirementTypeItem, 'id'>;

export async function createRequirementType(input: CreateRequirementTypeInput): Promise<RequirementTypeItem> {
  return http.post('/req-types', input);
}

export async function updateRequirementType(id: number, input: Partial<CreateRequirementTypeInput>): Promise<RequirementTypeItem> {
  return http.put(`/req-types/${id}`, input);
}

export async function toggleRequirementType(id: number): Promise<RequirementTypeItem> {
  return http.put(`/req-types/${id}/toggle`);
}

export async function deleteRequirementType(id: number): Promise<void> {
  await http.delete(`/req-types/${id}`);
}
