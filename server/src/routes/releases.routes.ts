import { Hono } from "hono";
import * as releaseService from "../services/release.service";

export function createReleaseRoutes() {
  const app = new Hono();

  const ctx = (c: { get: (k: "userId" | "username" | "role" | "groupName") => unknown }) => ({
    userId: c.get("userId") as number,
    username: c.get("username") as string,
    role: c.get("role") as string,
    groupName: c.get("groupName") as string | null,
  });

  app.get("/", async (c) => {
    const query = {
      page: parseInt(c.req.query("page") || "1"),
      pageSize: parseInt(c.req.query("pageSize") || "20"),
      status: c.req.query("status") || undefined,
      groupName: c.req.query("groupName") || undefined,
    };
    const result = await releaseService.listReleases(ctx(c), query);
    return c.json(result);
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.versionNo?.trim()) return c.json({ error: "版本号不能为空" }, 400);
    if (!body.releaseName?.trim()) return c.json({ error: "发版名称不能为空" }, 400);
    if (!body.groupName?.trim()) return c.json({ error: "所属组不能为空" }, 400);

    try {
      const release = await releaseService.createRelease(body);
      return c.json(release, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Get unassigned requirements — MUST be before /:id to avoid route conflict
  app.get("/unassigned-requirements", async (c) => {
    const releaseId = c.req.query("releaseId") ? parseInt(c.req.query("releaseId")!) : undefined;
    const groupName = c.req.query("groupName") || undefined;
    try {
      const reqs = await releaseService.getUnassignedRequirements(releaseId, groupName);
      return c.json(reqs);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  app.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const release = await releaseService.getRelease(ctx(c), id);
      return c.json(release);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  app.put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      const release = await releaseService.updateRelease(id, body);
      return c.json(release);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await releaseService.deleteRelease(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Review endpoints — ADMIN or GROUP_LEAD only
  app.post("/:id/submit-review", async (c) => {
    const role = c.get("role") as string;
    if (role !== "ADMIN" && role !== "GROUP_LEAD") {
      return c.json({ error: "权限不足，需要管理员或组长角色" }, 403);
    }
    const id = parseInt(c.req.param("id"));
    const reviewer = (c.get("username") as string) || "unknown";
    try {
      const release = await releaseService.submitForReview(id, reviewer);
      return c.json(release);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/:id/review", async (c) => {
    const role = c.get("role") as string;
    if (role !== "ADMIN" && role !== "GROUP_LEAD") {
      return c.json({ error: "权限不足，需要管理员或组长角色" }, 403);
    }
    const id = parseInt(c.req.param("id"));
    const { action, comment } = await c.req.json();
    const reviewer = (c.get("username") as string) || "unknown";
    try {
      const release = await releaseService.reviewRelease(id, reviewer, action, comment);
      return c.json(release);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Requirement management
  app.post("/:id/requirements", async (c) => {
    const id = parseInt(c.req.param("id"));
    const { requirementIds } = await c.req.json();
    if (!Array.isArray(requirementIds)) return c.json({ error: "requirementIds 必须是数组" }, 400);
    try {
      await releaseService.addRequirements(id, requirementIds);
      return c.json({ ok: true, count: requirementIds.length });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id/requirements/:reqId", async (c) => {
    const id = parseInt(c.req.param("id"));
    const reqId = parseInt(c.req.param("reqId"));
    try {
      await releaseService.removeRequirement(id, reqId);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
