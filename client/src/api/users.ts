import { http } from './http';

export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: string;
  groupName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  displayName: string;
  role?: string;
  groupName?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  role?: string;
  groupName?: string;
  isActive?: boolean;
  password?: string;
}

export async function listUsers(): Promise<UserInfo[]> {
  return http.get('/users');
}

export async function getUser(id: number): Promise<UserInfo> {
  return http.get(`/users/${id}`);
}

export async function createUser(input: CreateUserInput): Promise<UserInfo> {
  return http.post('/users', input);
}

export async function updateUser(id: number, input: UpdateUserInput): Promise<UserInfo> {
  return http.put(`/users/${id}`, input);
}

export async function deleteUser(id: number): Promise<void> {
  await http.delete(`/users/${id}`);
}

/** Search users by username prefix (for @mention autocomplete) */
export async function searchUsers(q: string): Promise<Array<{ id: number; username: string; displayName: string }>> {
  if (!q.trim()) return [];
  return http.get('/users/search', { q });
}

// ── Role Management ──

export interface RoleData {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  sortOrder: number;
  userCount: number;
}

export async function listRoles(): Promise<RoleData[]> {
  return http.get('/roles');
}

export async function createRole(input: { name: string; displayName: string; description?: string }): Promise<RoleData> {
  return http.post('/roles', input);
}

export async function updateRole(id: number, input: { displayName?: string; description?: string }): Promise<RoleData> {
  return http.put(`/roles/${id}`, input);
}

export async function deleteRole(id: number): Promise<void> {
  await http.delete(`/roles/${id}`);
}

export async function assignUserRole(userId: number, roleId: number): Promise<UserInfo> {
  return http.put(`/users/${userId}/role`, { roleId });
}
