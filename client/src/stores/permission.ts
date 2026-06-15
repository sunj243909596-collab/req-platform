// 权限 Store — class 单例 + subscribe 模式（与 auth.ts 一致）
import { fetchMyPermissions, type MyPermissions } from '../api/permissions';
import { isAuthenticated } from '../api/auth';

type Listener = (perms: ReadonlySet<string>) => void;

class PermissionStore {
  private perms: ReadonlySet<string> = new Set();
  private isAdminFlag = false;
  private loading = false;
  private ready = false;
  private listeners: Set<Listener> = new Set();

  get isAdmin(): boolean {
    return this.isAdminFlag;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get permissions(): ReadonlySet<string> {
    return this.perms;
  }

  /** 单个权限码检查；ADMIN 短路返回 true。 */
  has(code: string): boolean {
    if (this.isAdminFlag) return true;
    return this.perms.has(code);
  }

  /** 任一命中即可；ADMIN 短路返回 true。 */
  hasAny(...codes: string[]): boolean {
    if (this.isAdminFlag) return true;
    return codes.some((c) => this.perms.has(c));
  }

  /** 全部命中；ADMIN 短路返回 true。 */
  hasAll(...codes: string[]): boolean {
    if (this.isAdminFlag) return true;
    return codes.every((c) => this.perms.has(c));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l(this.perms);
  }

  /** 拉当前用户的权限。已 ready 时直接返回缓存（除非 force=true）。 */
  async fetch(force = false): Promise<MyPermissions | null> {
    if (!isAuthenticated()) {
      this.perms = new Set();
      this.isAdminFlag = false;
      this.ready = true;
      this.notify();
      return null;
    }
    if (this.ready && !force) return { permissions: Array.from(this.perms), isAdmin: this.isAdminFlag };

    this.loading = true;
    try {
      const data = await fetchMyPermissions();
      this.perms = new Set(data.permissions);
      this.isAdminFlag = data.isAdmin;
      this.ready = true;
      this.notify();
      return data;
    } catch {
      // 失败时清空 ready=true（避免永远转圈），perms 留旧值
      this.ready = true;
      return null;
    } finally {
      this.loading = false;
    }
  }

  /** 清空状态（用于登出时） */
  reset(): void {
    this.perms = new Set();
    this.isAdminFlag = false;
    this.ready = false;
    this.notify();
  }
}

export const permissionStore = new PermissionStore();
