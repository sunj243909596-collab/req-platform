// 权限 hook — 基于 permissionStore + useSyncExternalStore
import { useSyncExternalStore } from 'react';
import { permissionStore } from '../../stores/permission';

export interface UsePermissionResult {
  has: (code: string) => boolean;
  hasAny: (...codes: string[]) => boolean;
  hasAll: (...codes: string[]) => boolean;
  ready: boolean;
  isAdmin: boolean;
  perms: ReadonlySet<string>;
}

const subscribe = (l: () => void) => permissionStore.subscribe(l);
const getSnapshot = () => permissionStore.permissions;

export function usePermission(): UsePermissionResult {
  // 触发重渲
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    has: (code) => permissionStore.has(code),
    hasAny: (...codes) => permissionStore.hasAny(...codes),
    hasAll: (...codes) => permissionStore.hasAll(...codes),
    ready: permissionStore.isReady,
    isAdmin: permissionStore.isAdmin,
    perms: permissionStore.permissions,
  };
}
