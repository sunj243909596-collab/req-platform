// 权限组管理路由（admin 限定写）
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as pgService from "../services/permission-group.service";
import { listAllResources } from "../services/permission-resource.service";
import { prisma } from "../lib/prisma";

export function createPermissionGroupRoutes() {
  const app = new Hono();

  // 列表（任何登录用户可看 — 用于管理页 + 调试）
  app.get("/", async (c) => {
    const groups = await pgService.listPermissionGroups();
    return c.json(groups);
  });

  // 详情（含 permission + member 列表）— 任何登录用户可看
  app.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    const detail = await pgService.getPermissionGroup(id);
    if (!detail) return c.json({ error: "权限组不存在" }, 404);
    return c.json(detail);
  });

  // 成员列表（admin 限定）
  app.get("/:id/members", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    const detail = await pgService.getPermissionGroup(id);
    if (!detail) return c.json({ error: "权限组不存在" }, 404);
    return c.json({ members: detail.members });
  });

  // 创建
  app.post("/", requireRole("ADMIN"), async (c) => {
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: "权限组名称不能为空" }, 400);
    if (!body.displayName?.trim()) return c.json({ error: "显示名不能为空" }, 400);
    try {
      const pg = await pgService.createPermissionGroup({
        name: body.name,
        displayName: body.displayName,
        description: body.description,
        bindRole: body.bindRole,
        bindGroupName: body.bindGroupName,
        permissionIds: body.permissionIds,
        memberIds: body.memberIds,
      });
      return c.json(pg, 201);
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("无权") ? 403 : 400);
    }
  });

  // 更新元数据
  app.put("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    const body = await c.req.json();
    try {
      const pg = await pgService.updatePermissionGroup(id, {
        displayName: body.displayName,
        description: body.description,
        bindRole: body.bindRole,
        bindGroupName: body.bindGroupName,
        enabled: body.enabled,
        sortOrder: body.sortOrder,
      });
      return c.json(pg);
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("无权") ? 403 : 400);
    }
  });

  // 删除
  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    try {
      await pgService.deletePermissionGroup(id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("无权") || msg.includes("系统内置") ? 403 : 400);
    }
  });

  // 整组覆盖 permission 列表
  app.put("/:id/permissions", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    const body = await c.req.json();
    if (!Array.isArray(body.permissionIds))
      return c.json({ error: "permissionIds 必须为数组" }, 400);
    try {
      await pgService.setGroupPermissions(id, body.permissionIds);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("无权") ? 403 : 400);
    }
  });

  // 整组覆盖 member 列表
  app.put("/:id/users", requireRole("ADMIN"), async (c) => {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) return c.json({ error: "id 必须为整数" }, 400);
    const body = await c.req.json();
    if (!Array.isArray(body.userIds))
      return c.json({ error: "userIds 必须为数组" }, 400);
    try {
      await pgService.setGroupMembers(id, body.userIds);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("无权") ? 403 : 400);
    }
  });

  // 辅助端点：列出系统中所有 user 供「分配成员」下拉用（admin 限定）
  app.get("/-meta/users", requireRole("ADMIN"), async (c) => {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, displayName: true, role: true, groupName: true },
      orderBy: { id: "asc" },
    });
    return c.json({ users });
  });

  // 辅助端点：列出所有 resource + 树形结构（admin 限定，供管理 UI 用）
  app.get("/-meta/resources", requireRole("ADMIN"), async (c) => {
    const resources = await listAllResources();
    return c.json({ resources });
  });

  return app;
}
