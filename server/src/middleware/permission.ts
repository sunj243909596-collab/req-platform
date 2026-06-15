// 细粒度权限中间件 — requirePerm(...codes)
// 仿 requireRole 签名；ADMIN 短路；缓存由 cache service 提供
import type { MiddlewareHandler } from "hono";
import { resolveUserPermissions } from "../services/permission-resolver.service";
import {
  getCachedPermissions,
  setCachedPermissions,
} from "../services/permission-cache.service";

/** 要求用户拥有所有指定 permission code（AND 关系）。ADMIN 短路。*/
export function requirePerm(...codes: string[]): MiddlewareHandler {
  return async (c, next) => {
    // ADMIN 隐式超管
    if (c.get("isAdmin") === true) return next();

    let perms = c.get("permissions") as Set<string> | undefined;
    const userId = c.get("userId") as number;
    const role = c.get("role") as string;
    const groupName = c.get("groupName") as string | null;

    if (!perms || perms.size === 0) {
      // 先看缓存
      const cached = getCachedPermissions(userId);
      if (cached) {
        perms = cached;
      } else {
        perms = await resolveUserPermissions(userId, role, groupName);
        setCachedPermissions(userId, perms);
      }
      c.set("permissions", perms);
    }

    const missing = codes.filter((code) => !perms!.has(code));
    if (missing.length > 0) {
      return c.json(
        { error: "权限不足: " + missing.join(", ") },
        403
      );
    }
    return next();
  };
}

/** 要求用户拥有任一指定 permission code（OR 关系）。ADMIN 短路。*/
export function requireAnyPerm(...codes: string[]): MiddlewareHandler {
  return async (c, next) => {
    if (c.get("isAdmin") === true) return next();
    let perms = c.get("permissions") as Set<string> | undefined;
    const userId = c.get("userId") as number;
    const role = c.get("role") as string;
    const groupName = c.get("groupName") as string | null;
    if (!perms || perms.size === 0) {
      const cached = getCachedPermissions(userId);
      if (cached) perms = cached;
      else {
        perms = await resolveUserPermissions(userId, role, groupName);
        setCachedPermissions(userId, perms);
      }
      c.set("permissions", perms);
    }
    const ok = codes.some((code) => perms!.has(code));
    if (!ok) return c.json({ error: "权限不足" }, 403);
    return next();
  };
}
