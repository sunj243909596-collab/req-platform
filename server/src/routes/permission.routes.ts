// 权限点查询 — 任何登录用户可看
import { Hono } from "hono";
import { listAllPermissions } from "../services/permission-resource.service";

export function createPermissionRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const perms = await listAllPermissions();
    return c.json(perms);
  });

  return app;
}
