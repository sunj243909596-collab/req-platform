import { Hono } from "hono";
import * as teamLearningService from "../services/team-learning.service";

export function createTeamLearningRoutes() {
  const app = new Hono();

  const ctx = (c: { get: (k: "userId" | "username" | "role" | "groupName") => string | number | null }) => ({
    userId: c.get("userId") as number,
    username: c.get("username") as string,
    role: c.get("role") as string,
    groupName: c.get("groupName") as string | null,
  });

  // GET / — list with pagination + search + category filter
  app.get("/", async (c) => {
    const query = {
      page: parseInt(c.req.query("page") || "1"),
      pageSize: parseInt(c.req.query("pageSize") || "20"),
      category: c.req.query("category") || undefined,
      search: c.req.query("search") || undefined,
    };
    const result = await teamLearningService.listTeamLearnings(query);
    return c.json(result);
  });

  // GET /stats — category breakdown
  app.get("/stats", async (c) => {
    const stats = await teamLearningService.getLearningStats();
    return c.json(stats);
  });

  // POST / — create
  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400);
    if (!body.category) return c.json({ error: "请选择分类" }, 400);
    try {
      const item = await teamLearningService.createTeamLearning(ctx(c), body);
      return c.json(item, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // PUT /:id — update
  app.put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      const item = await teamLearningService.updateTeamLearning(id, body);
      return c.json(item);
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("不存在") ? 404 : 400);
    }
  });

  // DELETE /:id — delete
  app.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await teamLearningService.deleteTeamLearning(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
