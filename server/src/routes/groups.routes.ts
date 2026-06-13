import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import * as groupService from "../services/group.service";


export function createGroupRoutes() {
  const app = new Hono();

  const ctx = (c: { get: (k: "userId" | "username" | "role" | "groupName") => unknown }) => ({
    userId: c.get("userId") as number,
    username: c.get("username") as string,
    role: c.get("role") as string,
    groupName: c.get("groupName") as string | null,
  });

  app.get("/", async (c) => {
    const groups = await groupService.listGroups(ctx(c));
    return c.json(groups);
  });

  app.post("/", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    if (!body.groupName?.trim()) return c.json({ error: "组名不能为空" }, 400);
    try {
      const group = await groupService.createGroup(body);
      return c.json(group, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      const group = await groupService.updateGroup(id, body);
      return c.json(group);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await groupService.deleteGroup(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ================= Custom Fields =================

  // Global custom fields (no group filter) — MUST be before /:id/fields
  app.get("/fields", async (c) => {
    const fields = await prisma.customField.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return c.json(fields.map(f => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      options: f.options as unknown[],
    })));
  });

  app.post("/fields", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    if (!body.fieldName?.trim()) return c.json({ error: "字段名不能为空" }, 400);
    if (!body.fieldKey?.trim()) return c.json({ error: "字段标识不能为空" }, 400);
    if (!body.fieldType) return c.json({ error: "字段类型不能为空" }, 400);

    const existing = await prisma.customField.findFirst({
      where: { fieldKey: body.fieldKey },
    });
    if (existing) return c.json({ error: "字段标识已存在" }, 400);

    const field = await prisma.customField.create({
      data: {
        groupId: null,
        fieldName: body.fieldName,
        fieldKey: body.fieldKey,
        fieldType: body.fieldType,
        options: body.options,
        required: body.required ?? false,
        sortOrder: body.sortOrder ?? 0,
        placeholder: body.placeholder,
      },
    });
    return c.json({
      ...field,
      createdAt: field.createdAt.toISOString(),
      options: field.options as unknown[],
    }, 201);
  });

  app.get("/:id/fields", async (c) => {
    const groupId = parseInt(c.req.param("id"));
    const fields = await prisma.customField.findMany({
      where: { groupId },
      orderBy: { sortOrder: "asc" },
    });
    return c.json(fields.map(f => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      options: f.options as unknown[],
    })));
  });

  app.post("/:id/fields", requireRole("ADMIN"), async (c) => {
    const groupId = parseInt(c.req.param("id"));
    const body = await c.req.json();
    if (!body.fieldName?.trim()) return c.json({ error: "字段名不能为空" }, 400);
    if (!body.fieldKey?.trim()) return c.json({ error: "字段标识不能为空" }, 400);
    if (!body.fieldType) return c.json({ error: "字段类型不能为空" }, 400);

    const existing = await prisma.customField.findFirst({
      where: { groupId, fieldKey: body.fieldKey },
    });
    if (existing) return c.json({ error: "字段标识已存在" }, 400);

    const field = await prisma.customField.create({
      data: {
        groupId,
        fieldName: body.fieldName,
        fieldKey: body.fieldKey,
        fieldType: body.fieldType,
        options: body.options,
        required: body.required ?? false,
        sortOrder: body.sortOrder ?? 0,
        placeholder: body.placeholder,
      },
    });
    return c.json(field, 201);
  });

  app.put("/fields/:fid", requireRole("ADMIN"), async (c) => {
    const fid = parseInt(c.req.param("fid"));
    const body = await c.req.json();
    const field = await prisma.customField.update({ where: { id: fid }, data: body });
    return c.json(field);
  });

  app.delete("/fields/:fid", requireRole("ADMIN"), async (c) => {
    const fid = parseInt(c.req.param("fid"));
    await prisma.reqCustomValue.deleteMany({ where: { fieldId: fid } });
    await prisma.customField.delete({ where: { id: fid } });
    return c.json({ ok: true });
  });

  return app;
}
