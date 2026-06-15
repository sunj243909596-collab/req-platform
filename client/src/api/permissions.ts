import { http } from './http';

// ───────── Resource（资源注册表）─────────
export type ResourceType = 'MENU' | 'PAGE' | 'BUTTON';

export interface PermissionResource {
  id: number;
  code: string;
  type: ResourceType;
  parentCode: string | null;
  displayName: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
}

// ───────── Permission（权限点）─────────
export interface Permission {
  id: number;
  code: string;
  resourceCode: string;
  action: string;
  displayName: string;
  description: string | null;
}

// ───────── PermissionGroup（权限组）─────────
export interface PgSummary {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  bindRole: string | null;
  bindGroupName: string | null;
  enabled: boolean;
  sortOrder: number;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PgDetail extends PgSummary {
  items: Array<{ permissionId: number; permission: Permission }>;
  members: Array<{ userId: number; user: { id: number; username: string; displayName: string; role: string; groupName: string | null } }>;
}

// ───────── User Picker（meta）─────────
export interface UserOption {
  id: number;
  username: string;
  displayName: string;
  role: string;
  groupName: string | null;
}

// ───────── API 方法 ─────────
export async function listResources(): Promise<PermissionResource[]> {
  return http.get('/permission-resources');
}

export async function listAllPermissions(): Promise<Permission[]> {
  return http.get('/permissions');
}

export async function listPermissionGroups(): Promise<PgSummary[]> {
  return http.get('/permission-groups');
}

export async function getPermissionGroup(id: number): Promise<PgDetail> {
  return http.get(`/permission-groups/${id}`);
}

export async function createPermissionGroup(input: {
  name: string;
  displayName: string;
  description?: string;
  bindRole?: string;
  bindGroupName?: string;
  permissionIds?: number[];
  memberIds?: number[];
}): Promise<PgSummary> {
  return http.post('/permission-groups', input);
}

export async function updatePermissionGroup(
  id: number,
  input: {
    displayName?: string;
    description?: string;
    bindRole?: string | null;
    bindGroupName?: string | null;
    enabled?: boolean;
    sortOrder?: number;
  }
): Promise<PgSummary> {
  return http.put(`/permission-groups/${id}`, input);
}

export async function deletePermissionGroup(id: number): Promise<void> {
  await http.delete(`/permission-groups/${id}`);
}

export async function setGroupPermissions(id: number, permissionIds: number[]): Promise<void> {
  await http.put(`/permission-groups/${id}/permissions`, { permissionIds });
}

export async function setGroupMembers(id: number, userIds: number[]): Promise<void> {
  await http.put(`/permission-groups/${id}/users`, { userIds });
}

export async function listAdminUsers(): Promise<{ users: UserOption[] }> {
  return http.get('/permission-groups/-meta/users');
}

export async function listAdminResources(): Promise<{ resources: PermissionResource[] }> {
  return http.get('/permission-groups/-meta/resources');
}

export async function listGroupMembers(id: number): Promise<{
  members: PgDetail['members'];
}> {
  return http.get(`/permission-groups/${id}/members`);
}

export interface MyPermissions {
  permissions: string[];
  isAdmin: boolean;
}

export async function fetchMyPermissions(): Promise<MyPermissions> {
  return http.get('/users/me/permissions');
}

export async function invalidatePermissionCache(): Promise<{ ok: boolean }> {
  return http.post('/admin/invalidate-permission-cache', {});
}
