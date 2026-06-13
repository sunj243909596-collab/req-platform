import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as svc from "../services/skill.service";

export function createSkillRoutes() {
  const app = new Hono();

  // ===================== Assignments API (before :id to avoid route conflict) =====================

  // List all assignments
  app.get("/assignments", async (c) => {
    const assignments = await svc.listAssignments();
    return c.json(assignments);
  });

  // Upsert assignment (admin only)
  app.post("/assignments", requireRole("ADMIN"), async (c) => {
    try {
      const body = await c.req.json();
      const assignment = await svc.upsertAssignment(body);
      return c.json(assignment, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Delete assignment (admin only)
  app.delete("/assignments/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      await svc.deleteAssignment(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ===================== Skills API =====================

  // List all skills
  app.get("/", async (c) => {
    const skills = await svc.listSkills();
    return c.json(skills);
  });

  // Get single skill
  app.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "无效的技能 ID" }, 400);
    const skill = await svc.getSkill(id);
    if (!skill) return c.json({ error: "技能不存在" }, 404);
    return c.json(skill);
  });

  // Create skill (admin only)
  app.post("/", requireRole("ADMIN"), async (c) => {
    try {
      const body = await c.req.json();
      const skill = await svc.createSkill(body);
      return c.json(skill, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Update skill (admin only)
  app.put("/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的技能 ID" }, 400);
      const body = await c.req.json();
      const skill = await svc.updateSkill(id, body);
      return c.json(skill);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Delete skill (admin only)
  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的技能 ID" }, 400);
      await svc.deleteSkill(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Toggle skill enabled/disabled (admin only)
  app.post("/:id/toggle", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的技能 ID" }, 400);
      const skill = await svc.toggleSkill(id);
      return c.json(skill);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
