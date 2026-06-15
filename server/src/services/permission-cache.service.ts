// Permission cache — 内存 Map<userId, { perms, expiresAt }>，TTL 5 分钟
// 仿 rate-limit.ts 的 Map 风格；改 PG 时调 invalidatePermissionCache() 全清
import type { Permission } from "@prisma/client";

const TTL = 5 * 60 * 1000; // 5 分钟
const cache = new Map<number, { perms: Set<string>; expiresAt: number }>();

/** 取缓存的用户权限 code 集合。过期或不存在返回 null。*/
export function getCachedPermissions(userId: number): Set<string> | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry.perms;
}

/** 写入缓存（TTL 5min）。*/
export function setCachedPermissions(userId: number, perms: Set<string>): void {
  cache.set(userId, { perms, expiresAt: Date.now() + TTL });
}

/** 清缓存。userId 不传 = 清全部。*/
export function invalidatePermissionCache(userId?: number): void {
  if (userId === undefined) {
    cache.clear();
  } else {
    cache.delete(userId);
  }
}

/** 当前缓存条目数（仅用于调试 / 监控）。*/
export function permissionCacheSize(): number {
  return cache.size;
}
