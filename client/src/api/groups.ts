import { http } from './http';

export interface GroupInfo {
  id: number;
  groupName: string;
  description: string | null;
  createdAt: string;
}

export async function listGroups(): Promise<GroupInfo[]> {
  return http.get('/groups');
}

export async function createGroup(input: {
  groupName: string;
  description?: string;
}): Promise<GroupInfo> {
  return http.post('/groups', input);
}

export async function updateGroup(
  id: number,
  input: { groupName?: string; description?: string }
): Promise<GroupInfo> {
  return http.put(`/groups/${id}`, input);
}

export async function deleteGroup(id: number): Promise<void> {
  await http.delete(`/groups/${id}`);
}
