import { Hono } from "hono";
import * as notification from "../services/notification.service";

export function createNotificationRoutes() {
  const app = new Hono();

  const getUserId = (c: { get: (k: string) => unknown }) =>
    c.get("userId") as number;
  const getUsername = (c: { get: (k: string) => unknown }) =>
    c.get("username") as string;
  const getGroupName = (c: { get: (k: string) => unknown }) =>
    c.get("groupName") as string | null;

  // Get notifications
  app.get("/", async (c) => {
    const userId = getUserId(c);
    const limit = parseInt(c.req.query("limit") || "50");
    const notifications = await notification.getNotifications(userId, limit);
    return c.json(notifications);
  });

  // Get unread count
  app.get("/unread-count", async (c) => {
    const userId = getUserId(c);
    const count = await notification.getUnreadCount(userId);
    return c.json({ count });
  });

  // Mark single as read
  app.put("/:id/read", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const updated = await notification.markAsRead(id);
      return c.json(updated);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Mark all as read
  app.put("/read-all", async (c) => {
    const userId = getUserId(c);
    const result = await notification.markAllAsRead(userId);
    return c.json({ ok: true, count: result.count });
  });

  // Delete notification
  app.delete("/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      await notification.deleteNotification(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Create notification — 仅 ADMIN 可直接创建任意通知，防止普通用户伪装通知钓鱼
  app.post("/", async (c) => {
    const role = c.get("role") as string;
    if (role !== "ADMIN") {
      return c.json({ error: "仅管理员可直接创建通知" }, 403);
    }
    const body = await c.req.json();
    if (!body.userId) return c.json({ error: "userId is required" }, 400);
    if (!body.type) return c.json({ error: "type is required" }, 400);
    if (!body.content) return c.json({ error: "content is required" }, 400);

    try {
      const n = await notification.createNotification(body);
      return c.json({ ...n, createdAt: n.createdAt.toISOString() }, 201);
    } catch {
      return c.json({ error: "通知创建失败" }, 400);
    }
  });

  // Notify group members
  app.post("/notify-group", async (c) => {
    const body = await c.req.json();
    const groupName = getGroupName(c);
    if (!groupName) return c.json({ error: "User has no group" }, 400);
    if (!body.type) return c.json({ error: "type is required" }, 400);
    if (!body.content) return c.json({ error: "content is required" }, 400);

    try {
      const count = await notification.createNotificationsForGroup(
        groupName,
        getUsername(c),
        { type: body.type, reqId: body.reqId, content: body.content }
      );
      return c.json({ ok: true, count });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
