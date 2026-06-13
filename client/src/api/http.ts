// HTTP client with JWT auth interceptor
const BASE_URL = '/api/v1';

interface RequestConfig extends RequestInit {
  params?: Record<string, string | number | undefined>;
}

class HttpClient {
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = `${BASE_URL}${path}`;
    if (!params) return url;
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value));
      }
    }
    const qs = searchParams.toString();
    return qs ? `${url}?${qs}` : url;
  }

  private async request<T>(path: string, config: RequestConfig = {}): Promise<T> {
    const { params, ...init } = config;
    const url = this.buildUrl(path, params);
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...init, headers });

    if (res.status === 401) {
      const isLoginRequest = path.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('token');
        const onLoginPage =
          window.location.pathname === '/' || window.location.pathname === '/login';
        if (!onLoginPage) {
          window.location.href = '/';
        }
      }
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || '未授权');
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, body.error || `请求失败 (${res.status})`);
    }

    return res.json();
  }

  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>(path, { method: 'GET', params });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const http = new HttpClient();
