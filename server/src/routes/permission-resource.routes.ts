// 资源注册表查询 — 任何登录用户可看
import { Hono } from "hono";
import {
  listAllResources,
  getResourceByCode,
} from "../services/permission-resource.service";

export function createPermissionResourceRoutes() {
  const app = new Hono();

  app.get("/", async (c) => {
    const resources = await listAllResources();
    return c.json(resources);
  });

  app.get("/:code", async (c) => {
    const code = c.req.param("code");
    const r = await getResourceByCode(code);
    if (!r) return c.json({ error: "资源不存在" }, 404);
    return c.json(r);
  });

  return app;
}
