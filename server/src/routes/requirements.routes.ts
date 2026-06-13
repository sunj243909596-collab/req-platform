import { Hono } from "hono";
import { analyzeRequirement } from "../services/agent.service";
import { prismaStore } from "../services/prisma.store";
import * as reqService from "../services/requirement.service";
import * as categoryService from "../services/requirement-category.service";
import * as notif from "../services/notification.service";
import { generateExportExcel, ALL_EXPORT_FIELDS } from "../services/requirement-export.service";
import { prisma } from "../lib/prisma";
import type { RequirementQuery } from "shared-types";
import { previewImport, confirmImport } from "../services/requirement-import.service";
import { generateImportTemplate } from "../services/excel-template.service";


export function createRequirementRoutes() {
  const app = new Hono();

  const ctx = (c: { get: (k: "userId" | "username" | "role" | "groupName") => string | number | null }) => ({
    userId: c.get("userId") as number,
    username: c.get("username") as string,
    role: c.get("role") as string,
    groupName: c.get("groupName") as string | null,
  });

  app.get("/", async (c) => {
    const query: RequirementQuery & { releaseId?: number } = {
      page: parseInt(c.req.query("page") || "1"),
      pageSize: parseInt(c.req.query("pageSize") || "20"),
      search: c.req.query("search") || undefined,
      reqType: c.req.query("reqType") as RequirementQuery["reqType"],
      categoryId: c.req.query("categoryId")
        ? parseInt(c.req.query("categoryId")!, 10)
        : undefined,
      priority: c.req.query("priority") as RequirementQuery["priority"],
      status: c.req.query("status") || undefined,
      assignee: c.req.query("assignee") || undefined,
      module: c.req.query("module") || undefined,
      groupName: c.req.query("groupName") || undefined,
      sortBy: c.req.query("sortBy") || undefined,
      sortOrder: (c.req.query("sortOrder") as "asc" | "desc") || undefined,
      releaseId: c.req.query("releaseId") ? parseInt(c.req.query("releaseId")!) : undefined,
    };
    const result = await reqService.listRequirements(ctx(c), query);
    return c.json(result);
  });

  // GET /distinct-statuses — Return distinct status values that exist in the DB
  app.get("/distinct-statuses", async (c) => {
    const statuses = await reqService.getDistinctStatuses(ctx(c));
    return c.json({ statuses });
  });

  // GET /distinct-assignees — Return distinct assignee values (optional groupName filter)
  app.get("/distinct-assignees", async (c) => {
    const groupName = c.req.query("groupName") || undefined;
    const assignees = await reqService.getDistinctAssignees(ctx(c), groupName);
    return c.json({ assignees });
  });

  // GET /category-counts — Return filtered category counts for sidebar
  app.get("/category-counts", async (c) => {
    const query: RequirementQuery & { releaseId?: number } = {
      page: 1,
      pageSize: 1,
      search: c.req.query("search") || undefined,
      reqType: c.req.query("reqType") as RequirementQuery["reqType"],
      categoryId: c.req.query("categoryId") ? parseInt(c.req.query("categoryId")!, 10) : undefined,
      priority: c.req.query("priority") as RequirementQuery["priority"],
      status: c.req.query("status") || undefined,
      assignee: c.req.query("assignee") || undefined,
      module: c.req.query("module") || undefined,
      groupName: c.req.query("groupName") || undefined,
      releaseId: c.req.query("releaseId") ? parseInt(c.req.query("releaseId")!) : undefined,
    };
    const counts = await reqService.getCategoryCounts(ctx(c), query);
    return c.json({ categoryCounts: counts });
  });

  // ==================== Excel Import/Export Routes (before POST /) ====================

  // GET /export/fields — Return list of all exportable fields
  app.get("/export/fields", async (c) => {
    return c.json(ALL_EXPORT_FIELDS);
  });

  // POST /export — Export requirements to Excel with selected fields
  app.post("/export", async (c) => {
    try {
      const body = await c.req.json();
      const fields: string[] = body.fields || [];
      if (fields.length === 0) return c.json({ error: "请至少选择一个导出字段" }, 400);

      // Build query from current filters (same as list page)
      const query: RequirementQuery = {
        page: 1,
        pageSize: 10000, // get all for export
        search: body.search || undefined,
        reqType: body.reqType as RequirementQuery["reqType"],
        categoryId: body.categoryId ? parseInt(body.categoryId, 10) : undefined,
        priority: body.priority as RequirementQuery["priority"],
        status: body.status || undefined,
        assignee: body.assignee || undefined,
        module: body.module || undefined,
        groupName: body.groupName || undefined,
      };

      const rows = await reqService.getAllRequirementsForExport(ctx(c), query);

      // Map to export format
      const exportRows = rows.map((r) => ({
        reqNo: r.reqNo,
        title: r.title,
        categoryPath: r.categoryPath || "",
        reqType: r.reqType,
        priority: r.priority,
        status: r.status,
        module: r.module || "",
        assignee: r.assignee || "",
        groupName: r.groupName || "",
        targetDate: r.targetDate ? new Date(r.targetDate as any).toISOString().slice(0, 10) : "",
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        background: r.background || "",
        description: r.description || "",
        designSolution: r.designSolution || "",
        gspImpact: r.gspImpact || "待评估",
        relatedTables: r.relatedTables || "",
        createdAt: new Date(r.createdAt as any).toISOString().slice(0, 19),
        updatedAt: new Date(r.updatedAt as any).toISOString().slice(0, 19),
      }));

      const buffer = generateExportExcel(fields, exportRows);

      const timestamp = new Date().toISOString().slice(0, 10);
      const exportFilename = encodeURIComponent(`需求导出_${timestamp}.xlsx`);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="req-export-${timestamp}.xlsx"; filename*=UTF-8''${exportFilename}`,
        },
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /import/template — Download Excel import template
  app.get("/import/template", async (c) => {
    const buffer = generateImportTemplate();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    return new Response(blob, {
      headers: {
        "Content-Disposition": 'attachment; filename="requirement-import-template.xlsx"',
      },
    });
  });

  // POST /import/preview — Parse Excel, validate, return preview (no DB writes)
  app.post("/import/preview", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!file || typeof file === "string" || !file.arrayBuffer) {
        return c.json({ error: "请上传 Excel 文件" }, 400);
      }

      const fileName = (file as { name?: string }).name || "";
      if (!fileName.match(/\.xlsx?$/i)) {
        return c.json({ error: "仅支持 .xlsx 格式文件" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await previewImport(buffer, ctx(c));
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // POST /import/confirm — Re-parse the uploaded Excel server-side, validate
  // every row, and write server-validated valid rows to the database. Never
  // trusts client-supplied status fields; the { rows } body field (if any) is
  // ignored for legacy compatibility.
  app.post("/import/confirm", async (c) => {
    try {
      const form = await c.req.parseBody();
      const file = form["file"];
      if (!file || typeof file === "string" || !file.arrayBuffer) {
        return c.json({ error: "请上传 Excel 文件" }, 400);
      }

      const fileName = (file as { name?: string }).name || "";
      if (!fileName.match(/\.xlsx?$/i)) {
        return c.json({ error: "仅支持 .xlsx 格式文件" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await confirmImport(buffer, null, ctx(c));
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400);
    if (!body.categoryId) return c.json({ error: "请选择需求分类" }, 400);
    if (!body.priority) return c.json({ error: "优先级不能为空" }, 400);

    try {
      const req = await reqService.createRequirement(ctx(c), body);

      // Fire-and-forget AI analysis
      analyzeRequirement(req.id, req, prismaStore).catch(() => {});

      // Notify assignee if set
      if (req.assignee && req.assignee !== ctx(c).username) {
        const assigneeUser = await prisma.user.findFirst({
          where: { username: req.assignee },
          select: { id: true },
        });
        if (assigneeUser) {
          notif.createNotification({
            userId: assigneeUser.id,
            type: "ASSIGNED",
            reqId: req.id,
            content: `${ctx(c).username} 将需求「${req.title}」分配给你`,
          }).catch(() => {});
        }
      }

      return c.json(req, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Category tree — before /:id
  app.get("/categories", async (c) => {
    const tree = await categoryService.listCategoryTree();
    return c.json(tree);
  });

  app.post("/categories", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.parentId) return c.json({ error: "请指定父分类" }, 400);
      const cat = await categoryService.createCategory(ctx(c), body);
      return c.json(cat, 201);
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("仅管理员") ? 403 : 400);
    }
  });

  app.put("/categories/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      const body = await c.req.json();
      const cat = await categoryService.updateCategory(ctx(c), id, body);
      return c.json(cat);
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("仅管理员") ? 403 : 400);
    }
  });

  app.delete("/categories/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      await categoryService.deleteCategory(ctx(c), id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, msg.includes("仅管理员") ? 403 : 400);
    }
  });

  // View CRUD — MUST be before /:id to avoid route conflict
  app.get("/views", async (c) => {
    const userId = c.get("userId") as number;
    const views = await reqService.listViews(userId);
    return c.json(views);
  });

  app.post("/views", async (c) => {
    const userId = c.get("userId") as number;
    const body = await c.req.json();
    if (!body.name?.trim()) return c.json({ error: "视图名称不能为空" }, 400);
    try {
      const view = await reqService.createView({ ...body, userId });
      return c.json(view, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/views/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      await reqService.updateView(id, body);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/views/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await reqService.deleteView(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ====== 回收站（必须在 /:id 之前注册） ======

  app.get("/trash", async (c) => {
    const sp = c.req.query();
    const items = await reqService.listTrashRequirements(ctx(c), {
      page: sp.page ? parseInt(sp.page) : undefined,
      pageSize: sp.pageSize ? parseInt(sp.pageSize) : undefined,
      search: sp.search || undefined,
      deletedBy: sp.deletedBy || undefined,
    });
    return c.json(items);
  });

  app.post("/trash/batch-restore", async (c) => {
    const body = await c.req.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return c.json({ error: "请选择要还原的需求" }, 400);
    try {
      await reqService.batchRestoreRequirements(ctx(c), ids);
      return c.json({ ok: true, restored: ids.length });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("无权") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post("/trash/batch-permanent-delete", async (c) => {
    const body = await c.req.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return c.json({ error: "请选择要永久删除的需求" }, 400);
    try {
      await reqService.batchPermanentlyDeleteRequirements(ctx(c), ids);
      return c.json({ ok: true, deleted: ids.length });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("无权") || msg.includes("仅管理员") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post("/:id/restore", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await reqService.restoreRequirement(ctx(c), id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      return c.json({ error: msg }, 400);
    }
  });

  app.delete("/:id/permanent", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await reqService.permanentlyDeleteRequirement(ctx(c), id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("仅管理员") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.get("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const req = await reqService.getRequirement(ctx(c), id);
      return c.json(req);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  // POST /:id/transition — Status transition with assignee + comment (TAPD-style)
  app.post("/:id/transition", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      const body = await c.req.json();
      if (!body.status?.trim()) return c.json({ error: "目标状态不能为空" }, 400);

      // Get current state
      const existing = await prisma.requirement.findUnique({
        where: { id },
        select: { title: true, status: true, assignee: true, groupName: true },
      });
      if (!existing) return c.json({ error: "需求不存在" }, 404);

      // Validate transition against WorkflowDefinition system
      const group = await prisma.group.findUnique({
        where: { groupName: existing.groupName },
        select: { id: true },
      });
      if (group) {
        const { isTransitionAllowed, getAllowedNextStatuses } = await import("../services/workflow.service");
        const allowed = await isTransitionAllowed(group.id, existing.status, body.status);
        if (!allowed) {
          const allowedStatuses = await getAllowedNextStatuses(group.id, existing.status);
          return c.json(
            { error: `状态不可从「${existing.status}」直接变为「${body.status}」。允许流转：${allowedStatuses.join('、') || "无"}` },
            400
          );
        }
      }

      // Update requirement
      const actor = ctx(c).username;
      const updateData: any = { status: body.status.trim() };
      if (body.assignee !== undefined) updateData.assignee = body.assignee || null;

      await prisma.requirement.update({ where: { id }, data: updateData });

      // Record activity log
      const oldStatus = existing.status;
      const newStatus = body.status.trim();
      await prisma.activityLog.create({
        data: {
          reqId: id,
          actor,
          action: "STATUS_CHANGED",
          fieldName: "status",
          oldValue: oldStatus,
          newValue: newStatus,
          detail: {
            transition: `${oldStatus} → ${newStatus}`,
            comment: body.comment || null,
            assignee: body.assignee || existing.assignee,
          },
        },
      });

      // If comment provided, create a comment record and handle @mentions
      if (body.comment?.trim()) {
        const commentContent = `【状态流转：${oldStatus} → ${newStatus}】${body.comment.trim()}`;
        await prisma.comment.create({
          data: {
            reqId: id,
            author: actor,
            content: commentContent,
            isMention: /@\w+/.test(body.comment.trim()),
          },
        });

        // Parse @mentions and send notifications
        const mentionRegex = /@(\w[\w.-]*)/g;
        const mentionedUsernames = new Set<string>();
        let match;
        while ((match = mentionRegex.exec(body.comment.trim())) !== null) {
          const uname = match[1];
          if (uname.length >= 2 && uname !== actor) {
            mentionedUsernames.add(uname);
          }
        }
        for (const uname of mentionedUsernames) {
          const mentionedUser = await prisma.user.findFirst({
            where: { username: uname, isActive: true },
            select: { id: true },
          });
          if (mentionedUser) {
            notif.createNotification({
              userId: mentionedUser.id,
              type: "MENTIONED",
              reqId: id,
              content: `${actor} 在需求「${existing.title}」的状态变更中 @了你`,
            }).catch(() => {});
          }
        }
      }

      // Notify assignee
      if (body.assignee && body.assignee !== actor) {
        const assigneeUser = await prisma.user.findFirst({
          where: { username: body.assignee },
          select: { id: true },
        });
        if (assigneeUser) {
          notif
            .createNotification({
              userId: assigneeUser.id,
              type: "STATUS_CHANGED",
              reqId: id,
              content: `${actor} 将需求「${existing.title}」状态变更为「${newStatus}」并分配给你`,
            })
            .catch(() => {});
        }
      }

      return c.json({
        ok: true,
        oldStatus,
        newStatus,
        assignee: body.assignee || existing.assignee,
        transition: `${oldStatus} → ${newStatus}`,
      });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    try {
      // Get current state before update for notifications
      const before = await prisma.requirement.findUnique({
        where: { id },
        select: { title: true, assignee: true, status: true },
      });

      const req = await reqService.updateRequirement(ctx(c), id, body);

      // Fire-and-forget notifications
      if (before) {
        const actor = ctx(c).username;

        // Assignee changed → notify new assignee
        if (body.assignee && body.assignee !== before.assignee && body.assignee !== actor) {
          const user = await prisma.user.findFirst({ where: { username: body.assignee }, select: { id: true } });
          if (user) {
            notif.createNotification({
              userId: user.id,
              type: "ASSIGNED",
              reqId: id,
              content: `${actor} 将需求「${before.title}」分配给你`,
            }).catch(() => {});
          }
        }

        // Status changed → notify assignee & reporter
        if (body.status && body.status !== before.status && before.assignee && before.assignee !== actor) {
          const user = await prisma.user.findFirst({ where: { username: before.assignee }, select: { id: true } });
          if (user) {
            notif.createNotification({
              userId: user.id,
              type: "STATUS_CHANGED",
              reqId: id,
              content: `需求「${before.title}」状态变更为 ${body.status}`,
            }).catch(() => {});
          }
        }
      }

      return c.json(req);
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("无权") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await reqService.deleteRequirement(ctx(c), id);
      return c.json({ ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("无权") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post("/batch-delete", async (c) => {
    const body = await c.req.json();
    const ids = Array.isArray(body.ids) ? body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) {
      return c.json({ error: "请选择要删除的需求" }, 400);
    }
    try {
      await reqService.batchDeleteRequirements(ctx(c), ids);
      return c.json({ ok: true, deleted: ids.length });
    } catch (err) {
      const msg = (err as Error).message;
      const status = msg.includes("无权") ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.get("/:id/history", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const history = await reqService.getRequirementHistory(ctx(c), id);
      return c.json(history);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404);
    }
  });

  return app;
}
