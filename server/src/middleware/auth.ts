// JWT Authentication middleware for Hono
import type { MiddlewareHandler } from "hono";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { resolveUserPermissions } from "../services/permission-resolver.service";
import {
  getCachedPermissions,
  setCachedPermissions,
} from "../services/permission-cache.service";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "dev-secret-change-in-production") {
  throw new Error(
    "FATAL: JWT_SECRET 未设置或仍为默认值，服务器拒绝启动。请在 .env 中配置一个随机强密钥。"
  );
}

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  groupName: string | null;
  tokenVersion: number;          // v1.0.0 改密即时失效；老 token 缺失时按 0 处理
}

/** Verify JWT token and attach user info to context */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "未提供认证令牌", errorCode: "NO_AUTH" }, 401);
  }

  const token = authHeader.slice(7);

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET as string) as JwtPayload;
  } catch {
    return c.json({ error: "令牌无效或已过期", errorCode: "INVALID_TOKEN" }, 401);
  }

  // v1.0.0：校验 isActive 与 tokenVersion，旧 token（无该字段）按 0 兼容
  const jwtTokenVersion = (decoded as { tokenVersion?: number }).tokenVersion ?? 0;
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { isActive: true, tokenVersion: true },
  });
  if (!user) {
    return c.json({ error: "用户不存在", errorCode: "USER_NOT_FOUND" }, 401);
  }
  if (!user.isActive) {
    return c.json({ error: "账户已停用", errorCode: "USER_DISABLED" }, 403);
  }
  if (user.tokenVersion !== jwtTokenVersion) {
    return c.json({ error: "会话已失效，请重新登录", errorCode: "TOKEN_REVOKED" }, 401);
  }

  c.set("userId", decoded.userId);
  c.set("username", decoded.username);
  c.set("role", decoded.role);
  c.set("groupName", decoded.groupName);
  c.set("tokenVersion", jwtTokenVersion);
  // 注入权限上下文
  c.set("isAdmin", decoded.role === "ADMIN");
  const cached = getCachedPermissions(decoded.userId);
  if (cached) {
    c.set("permissions", cached);
  } else {
    let perms: Set<string>;
    if (decoded.role === "ADMIN") {
      // ADMIN 短路：一次性拉所有 permission code，命中任意 has()
      const all = await prisma.permission.findMany({ select: { code: true } });
      perms = new Set(all.map((r) => r.code));
    } else {
      perms = await resolveUserPermissions(
        decoded.userId,
        decoded.role,
        decoded.groupName
      );
    }
    setCachedPermissions(decoded.userId, perms);
    c.set("permissions", perms);
  }
  await next();
};

/** Require specific role(s) */
export function requireRole(...roles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const userRole = c.get("role") as string;
    if (!roles.includes(userRole)) {
      return c.json({ error: "权限不足" }, 403);
    }
    await next();
  };
}

/** Generate JWT token */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}
