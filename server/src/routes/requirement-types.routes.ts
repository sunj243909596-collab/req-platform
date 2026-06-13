import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as svc from "../services/requirement-type.service";

export function createRequirementTypeRoutes() {
  const app = new Hono();

  // 公共：已登录用户都能拉（下拉框/徽标用）
  app.get("/", async (c) => {
    const types = await svc.listEnabledTypes();
    return c.json(types);
  });

  // admin：全量（含 disabled），管理页用
  app.get("/all", requireRole("ADMIN"), async (c) => {
    const types = await svc.listAllTypes();
    return c.json(types);
  });

  // admin CRUD
  app.post("/", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    try {
      const type = await svc.createType(body);
      return c.json(type, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      const type = await svc.updateType(id, body);
      return c.json(type);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/:id/toggle", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const type = await svc.toggleType(id);
      return c.json(type);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await svc.deleteType(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
