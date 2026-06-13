import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as userService from "../services/user.service";
import { prisma } from "../lib/prisma";


export function createUserRoutes() {
  const app = new Hono();

  const ctx = (c: { get: (k: "userId" | "username" | "role" | "groupName") => unknown }) => ({
    userId: c.get("userId") as number,
    username: c.get("username") as string,
    role: c.get("role") as string,
    groupName: c.get("groupName") as string | null,
  });

  // Search users by username prefix (for @mention autocomplete — any authenticated user)
  app.get("/search", async (c) => {
    const q = (c.req.query("q") || "").trim();
    if (q.length < 2) return c.json([]);
    const users = await prisma.user.findMany({
      where: {
        username: { contains: q, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, username: true, displayName: true },
      take: 10,
    });
    return c.json(users);
  });

  // List users — ADMIN only
  app.get("/", requireRole("ADMIN"), async (c) => {
    const users = await userService.listUsers(ctx(c));
    return c.json(users);
  });

  // Get user — ADMIN or own
  app.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const userId = c.get("userId") as number;
    const userRole = c.get("role") as string;
    if (userRole !== "ADMIN" && id !== userId) {
      return c.json({ error: "权限不足" }, 403);
    }
    try {
      const user = await userService.getUser(ctx(c), id);
      return c.json(user);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  // Create user — ADMIN only
  app.post("/", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    if (!body.username?.trim()) return c.json({ error: "用户名不能为空" }, 400);
    if (!body.password) return c.json({ error: "密码不能为空" }, 400);
    if (!body.displayName?.trim()) return c.json({ error: "显示名不能为空" }, 400);
    if (!body.role) return c.json({ error: "角色不能为空" }, 400);

    try {
      const user = await userService.createUser({
        username: body.username.trim(),
        password: body.password,
        displayName: body.displayName.trim(),
        role: body.role,
        groupName: body.groupName,
      });
      return c.json(user, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Update user — ADMIN only
  app.put("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      const user = await userService.updateUser(id, body);
      return c.json(user);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Delete user — ADMIN only
  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await userService.deleteUser(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
