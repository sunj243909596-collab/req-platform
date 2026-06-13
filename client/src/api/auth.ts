import { http } from './http';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserInfo {
  id: number;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'GROUP_LEAD' | 'MEMBER';
  groupName: string | null;
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const data = await http.post<LoginResponse>('/auth/login', credentials);
  localStorage.setItem('token', data.token);
  return data;
}

export async function getCurrentUser(): Promise<UserInfo> {
  return http.get<UserInfo>('/users/me');
}

export function logout(): void {
  localStorage.removeItem('token');
  window.location.href = '/';
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('token');
}
