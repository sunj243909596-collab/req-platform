import { Hono } from "hono";
import { changeMyPassword } from "../services/user.service";
import { UserError } from "../services/user-error";
import { getClientIp } from "../utils/password-audit-log";

/**
 * POST /api/v1/me/password
 *   - 用户自助改密（任何已登录用户；非 ADMIN 特权）
 *   - 经 authMiddleware + changePasswordLimiter（3次/分钟/用户）
 *   - 成功 → 200 + 旧 JWT 在 next 请求因 tokenVersion 不匹配自然失效
 */
export function createMeRoutes() {
  const app = new Hono();

  app.post("/password", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    try {
      const result = await changeMyPassword({
        userId: c.get("userId") as number,
        username: c.get("username") as string,
        currentPassword: body.currentPassword ?? "",
        newPassword: body.newPassword ?? "",
        confirmPassword: body.confirmPassword ?? "",
        ip: getClientIp(c),
      });
      c.header("Cache-Control", "no-store");
      return c.json({
        ok: true,
        passwordChangedAt: result.passwordChangedAt!.toISOString(),
        message: "密码已修改，请重新登录",
      });
    } catch (e) {
      if (e instanceof UserError) {
        return c.json(
          {
            error: e.message,
            errorCode: e.code,
            field: e.field,
          },
          e.http as 400 | 401 | 403 | 404,
        );
      }
      console.error("[me/password] internal error:", e);
      return c.json({ error: "内部错误", errorCode: "INTERNAL" }, 500);
    }
  });

  return app;
}
