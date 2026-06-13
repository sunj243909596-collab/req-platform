// JWT Authentication middleware for Hono
import type { MiddlewareHandler } from "hono";
import jwt from "jsonwebtoken";

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
}

/** Verify JWT token and attach user info to context */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "未提供认证令牌" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as JwtPayload;
    c.set("userId", decoded.userId);
    c.set("username", decoded.username);
    c.set("role", decoded.role);
    c.set("groupName", decoded.groupName);
    await next();
  } catch {
    return c.json({ error: "令牌无效或已过期" }, 401);
  }
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
