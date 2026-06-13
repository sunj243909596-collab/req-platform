// Simple auth state management — no external deps required
import { getCurrentUser, logout, isAuthenticated, type UserInfo } from '../api/auth';

type AuthListener = (user: UserInfo | null) => void;

class AuthStore {
  private user: UserInfo | null = null;
  private loading = false;
  private listeners: Set<AuthListener> = new Set();

  get isAuthenticated(): boolean {
    return isAuthenticated();
  }

  get currentUser(): UserInfo | null {
    return this.user;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.user);
    }
  }

  async fetchUser(): Promise<UserInfo | null> {
    if (!isAuthenticated()) {
      this.user = null;
      this.notify();
      return null;
    }

    this.loading = true;
    try {
      this.user = await getCurrentUser();
      this.notify();
      return this.user;
    } catch {
      this.user = null;
      this.notify();
      return null;
    } finally {
      this.loading = false;
    }
  }

  async logout(): Promise<void> {
    this.user = null;
    logout();
    this.notify();
  }
}

export const authStore = new AuthStore();
