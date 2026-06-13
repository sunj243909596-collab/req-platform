import "./types/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma";
import { authMiddleware, generateToken } from "./middleware/auth";
import { loginRateLimit, aiRateLimit, generalRateLimit } from "./middleware/rate-limit";
import { createAgentRoutes } from "./routes/agent.routes";
import { createKnowledgeRoutes } from "./routes/knowledge.routes";
import { createGroupRoutes } from "./routes/groups.routes";
import { createRequirementRoutes } from "./routes/requirements.routes";
import { createReleaseRoutes } from "./routes/releases.routes";
import { createCollaborationRoutes } from "./routes/collaboration.routes";
import { createNotificationRoutes } from "./routes/notification.routes";
import { createUserRoutes } from "./routes/users.routes";
import { createTeamLearningRoutes } from "./routes/team-learnings.routes";
import { createSkillRoutes } from "./routes/skill.routes";
import { createManualRoutes } from "./routes/manual.routes";
import { createRequirementTypeRoutes } from "./routes/requirement-types.routes";
import { createRequirementNumberRuleRoutes } from "./routes/requirement-number-rule.routes";
import { prismaStore } from "./services/prisma.store";
import { getDashboardStats } from "./services/requirement.service";
import { getCategoryHeatmap } from "./services/requirement.service";
import { seedDefaultSkills } from "./services/skill.service";

const app = new Hono();

app.use("*", cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:6173",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

app.use("*", secureHeaders({
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
}));

// 请求体大小限制：JSON 接口最大 1MB
app.use("*", async (c, next) => {
  const contentLength = c.req.header("content-length");
  if (contentLength && parseInt(contentLength) > 1024 * 1024) {
    return c.json({ error: "请求体过大，最大允许 1MB" }, 413);
  }
  return next();
});

// Request trace ID — helps correlate logs across distributed calls
app.use("*", async (c, next) => {
  const traceId = c.req.header("x-request-id") || crypto.randomUUID();
  c.res.headers.set("x-request-id", traceId);
  await next();
});

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.post("/api/v1/auth/login", loginRateLimit, async (c) => {
  const { username, password } = await c.req.json();
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.isActive) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }

  const bcryptLib = (bcrypt as { default?: typeof bcrypt }).default || bcrypt;
  const valid = await bcryptLib.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "用户名或密码错误" }, 401);
  }

  const token = generateToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    groupName: user.groupName,
  });

  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      groupName: user.groupName,
      isActive: user.isActive,
    },
  });
});

const api = new Hono();
api.use("*", authMiddleware);
api.use("*", generalRateLimit);
api.use("/agent/chat*", aiRateLimit);
api.use("/agent/req*", aiRateLimit);

api.route("/agent", createAgentRoutes(prismaStore));
api.route("/knowledge", createKnowledgeRoutes(prismaStore));
api.route("/groups", createGroupRoutes());
api.route("/req-types", createRequirementTypeRoutes());
api.route("/req-number-rule", createRequirementNumberRuleRoutes());
api.route("/requirements", createRequirementRoutes());
api.route("/releases", createReleaseRoutes());

api.get("/users/me", async (c) => {
  const userId = c.get("userId");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "用户不存在" }, 404);
  return c.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    groupName: user.groupName,
    isActive: user.isActive,
  });
});

api.get("/stats/dashboard", async (c) => {
  const stats = await getDashboardStats({
    userId: c.get("userId"),
    username: c.get("username"),
    role: c.get("role"),
    groupName: c.get("groupName"),
  });
  return c.json(stats);
});

api.get("/stats/category-heatmap", async (c) => {
  const weeks = Math.max(2, Math.min(12, parseInt(c.req.query("weeks") ?? "6") || 6));
  const data = await getCategoryHeatmap({
    userId: c.get("userId"),
    username: c.get("username"),
    role: c.get("role"),
    groupName: c.get("groupName"),
  }, weeks);
  return c.json(data);
});

// System Config — module options
api.get("/config/module-options", async (c) => {
  const { getModuleOptions } = await import("./services/system-config.service");
  const options = await getModuleOptions();
  return c.json({ options });
});

api.put("/config/module-options", async (c) => {
  const { setConfig } = await import("./services/system-config.service");
  const body = await c.req.json();
  if (!body.options || !Array.isArray(body.options)) {
    return c.json({ error: "options 必须是字符串数组" }, 400);
  }
  await setConfig("module_options", body.options.map((s: string) => s.trim()).filter(Boolean), c.get("username") as string);
  return c.json({ options: body.options });
});

// Workflow Designer API
api.get("/workflows", async (c) => {
  const { listWorkflows } = await import("./services/workflow.service");
  const groupId = c.req.query("groupId");
  const workflows = await listWorkflows(groupId ? parseInt(groupId) : undefined);
  return c.json(workflows);
});

api.get("/workflows/:id", async (c) => {
  const { getWorkflow } = await import("./services/workflow.service");
  const wf = await getWorkflow(parseInt(c.req.param("id")));
  if (!wf) return c.json({ error: "工作流不存在" }, 404);
  return c.json(wf);
});

api.post("/workflows", async (c) => {
  const { createWorkflow } = await import("./services/workflow.service");
  const body = await c.req.json();
  if (!body.name?.trim() || !body.groupId) return c.json({ error: "名称和组不能为空" }, 400);
  const wf = await createWorkflow({ name: body.name.trim(), description: body.description, groupId: body.groupId });
  return c.json(wf, 201);
});

api.put("/workflows/:id", async (c) => {
  const { updateWorkflow } = await import("./services/workflow.service");
  const body = await c.req.json();
  const wf = await updateWorkflow(parseInt(c.req.param("id")), body);
  return c.json(wf);
});

api.delete("/workflows/:id", async (c) => {
  const { deleteWorkflow } = await import("./services/workflow.service");
  await deleteWorkflow(parseInt(c.req.param("id")));
  return c.json({ success: true });
});

api.put("/workflows/:id/statuses", async (c) => {
  const { updateStatuses } = await import("./services/workflow.service");
  const body = await c.req.json();
  if (!body.statuses || !Array.isArray(body.statuses)) return c.json({ error: "statuses 必须为数组" }, 400);
  const wf = await updateStatuses(parseInt(c.req.param("id")), body.statuses);
  return c.json(wf);
});

api.put("/workflows/:id/transitions", async (c) => {
  const { updateTransitions } = await import("./services/workflow.service");
  const body = await c.req.json();
  if (!body.transitions || !Array.isArray(body.transitions)) return c.json({ error: "transitions 必须为数组" }, 400);
  const wf = await updateTransitions(parseInt(c.req.param("id")), body.transitions);
  return c.json(wf);
});

api.get("/workflows/:id/transitions", async (c) => {
  const { getWorkflowTransitions } = await import("./services/workflow.service");
  const transitions = await getWorkflowTransitions(parseInt(c.req.param("id")));
  return c.json({ transitions });
});

// Role Management
api.get("/roles", async (c) => {
  const { listRoles } = await import("./services/role.service");
  return c.json(await listRoles());
});

api.post("/roles", async (c) => {
  const { createRole } = await import("./services/role.service");
  const body = await c.req.json();
  if (!body.name?.trim() || !body.displayName?.trim()) return c.json({ error: "角色名和显示名不能为空" }, 400);
  const role = await createRole(body);
  return c.json(role, 201);
});

api.put("/roles/:id", async (c) => {
  const { updateRole } = await import("./services/role.service");
  const body = await c.req.json();
  const role = await updateRole(parseInt(c.req.param("id")), body);
  return c.json(role);
});

api.delete("/roles/:id", async (c) => {
  const { deleteRole } = await import("./services/role.service");
  await deleteRole(parseInt(c.req.param("id")));
  return c.json({ success: true });
});

api.put("/users/:id/role", async (c) => {
  const { assignUserRole } = await import("./services/role.service");
  const body = await c.req.json();
  if (!body.roleId) return c.json({ error: "roleId 不能为空" }, 400);
  const user = await assignUserRole(parseInt(c.req.param("id")), body.roleId);
  return c.json(user);
});

// User CRUD (after /users/me so specific route takes precedence)
api.route("/users", createUserRoutes());

// Collaboration features (subtasks, comments, relations)
api.route("/collaboration", createCollaborationRoutes());

// Notifications
api.route("/notifications", createNotificationRoutes());

api.route("/team-learnings", createTeamLearningRoutes());

// AI Skills management
api.route("/skills", createSkillRoutes());

// Operation Manuals
api.route("/manuals", createManualRoutes());

app.route("/api/v1", api);

// Seed default roles on startup
import("./services/role.service").then(m => m.seedDefaultRoles())
  .then(() => console.log("[startup] Default roles seeded"))
  .catch(err => console.warn("[startup] Role seeding:", err.message));

// Seed default AI skills on startup
seedDefaultSkills().then(() => console.log("[startup] Default AI skills seeded")).catch((err) => console.warn("[startup] Skill seeding:", err.message));

// Repair KB file links for existing documents (one-time sync fix).
// Set REPAIR_KB_FILE_LINKS=true to run; off by default since migration is complete.
if (process.env.REPAIR_KB_FILE_LINKS === "true") {
  import("./services/doc-rag-indexer.service").then(m => m.repairKbFileLinks())
    .then(r => console.log(`[startup] KB file repair: ${r.copied} copied, ${r.skipped} skipped`))
    .catch(err => console.warn("[startup] KB file repair:", err.message));
}

// Re-index all operation manuals into RAG KB on startup.
// Set RAG_STARTUP_REINDEX=false to skip; trigger manually via POST /api/v1/knowledge/bases/:id/sync.
if (process.env.RAG_STARTUP_REINDEX !== "false") {
  import("./services/manual-rag-indexer.service").then(m => m.reindexAllManuals())
    .then(r => console.log(`[startup] Manual RAG reindex: ${r.indexed} indexed, ${r.skipped} skipped, ${r.failed} failed`))
    .catch(err => console.warn("[startup] Manual RAG reindex:", err.message));
} else {
  console.log("[startup] Manual RAG reindex skipped (RAG_STARTUP_REINDEX=false)");
}

// Re-index all requirements & releases into "需求列表" RAG KB on startup.
// Without this, historical requirements never get into RAG — fire-and-forget
// in createRequirement only handles new/updated records going forward.
// Set RAG_STARTUP_REQ_REINDEX=false to skip; trigger manually via
// POST /api/v1/knowledge/requirement-kb/rebuild (ADMIN only).
if (process.env.RAG_STARTUP_REQ_REINDEX !== "false") {
  import("./services/requirement-indexer.service").then(m => m.rebuildRequirementKb())
    .then(r => console.log(`[startup] Requirement RAG reindex: ${r.indexed} indexed, ${r.failed} failed`))
    .catch(err => console.warn("[startup] Requirement RAG reindex:", err.message));
} else {
  console.log("[startup] Requirement RAG reindex skipped (RAG_STARTUP_REQ_REINDEX=false)");
}

const port = parseInt(process.env.PORT || "8001");
console.log(`Server starting on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
