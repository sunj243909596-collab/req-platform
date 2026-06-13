import { Hono } from "hono";
import * as collab from "../services/collaboration.service";
import * as notif from "../services/notification.service";
import { indexDocumentInRAG, removeDocumentFromRAG } from "../services/doc-rag-indexer.service";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ================= Document Upload Constants =================

const REQ_DOC_UPLOAD_DIR = path.join(process.cwd(), "uploads", "req-docs");
const ALLOWED_DOC_EXTS = [".md", ".html", ".htm", ".docx", ".xlsx", ".xls"];
const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_DOC_TYPES = ["BRD", "FSD", "PRD", "数据模型设计", "其他"];

/** Map file extension to preview mimeType */
function getMimeType(ext: string): string {
  switch (ext) {
    case ".md": return "text/markdown";
    case ".html": case ".htm": return "text/html";
    case ".docx": return "application/docx";
    case ".xlsx": case ".xls": return "application/xlsx";
    default: return "text/plain";
  }
}

function sanitizeDocFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
}

/** 检查当前用户是否可编辑指定需求（是负责人、报告人或 ADMIN/GROUP_LEAD） */
async function canEditReq(c: { get: (k: string) => unknown }, reqId: number): Promise<boolean> {
  const role = c.get("role") as string;
  if (role === "ADMIN" || role === "GROUP_LEAD") return true;
  const username = c.get("username") as string;
  const req = await prisma.requirement.findUnique({
    where: { id: reqId },
    select: { assignee: true, reporter: true },
  });
  if (!req) return false;
  return req.assignee === username || req.reporter === username;
}

/** 检查评论是否属于当前用户（或是 ADMIN） */
async function canDeleteComment(c: { get: (k: string) => unknown }, commentId: number): Promise<boolean> {
  const role = c.get("role") as string;
  if (role === "ADMIN") return true;
  const username = c.get("username") as string;
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { author: true } });
  return comment?.author === username;
}

export function createCollaborationRoutes() {
  const app = new Hono();

  // ================= SubTasks =================

  app.get("/:reqId/subtasks", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const tasks = await collab.listSubTasks(reqId);
    return c.json(tasks);
  });

  app.post("/:reqId/subtasks", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const body = await c.req.json();
    if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400);
    try {
      const task = await collab.createSubTask(reqId, body);
      return c.json(task, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.put("/subtasks/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const subtask = await prisma.subTask.findUnique({ where: { id }, select: { reqId: true } });
    if (!subtask) return c.json({ error: "子任务不存在" }, 404);
    if (!(await canEditReq(c, subtask.reqId))) return c.json({ error: "无权修改该子任务" }, 403);
    const body = await c.req.json();
    try {
      const task = await collab.updateSubTask(id, body);
      return c.json(task);
    } catch {
      return c.json({ error: "操作失败" }, 400);
    }
  });

  app.delete("/subtasks/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const subtask = await prisma.subTask.findUnique({ where: { id }, select: { reqId: true } });
    if (!subtask) return c.json({ error: "子任务不存在" }, 404);
    if (!(await canEditReq(c, subtask.reqId))) return c.json({ error: "无权删除该子任务" }, 403);
    try {
      await collab.deleteSubTask(id);
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "操作失败" }, 400);
    }
  });

  // ================= Comments =================

  app.get("/:reqId/comments", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const comments = await collab.listComments(reqId);
    return c.json(comments);
  });

  app.post("/:reqId/comments", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const body = await c.req.json();
    const author = (c.get("username") as string) || "anonymous";
    try {
      const comment = await collab.createComment(reqId, author, body.content);

      // Notify assignee and reporter of new comment (fire-and-forget)
      const req = await prisma.requirement.findUnique({
        where: { id: reqId },
        select: { title: true, assignee: true, reporter: true, groupName: true },
      });
      if (req) {
        const notifyTargets = new Set<string>();
        if (req.assignee && req.assignee !== author) notifyTargets.add(req.assignee);
        if (req.reporter && req.reporter !== author) notifyTargets.add(req.reporter);

        const isMention = body.content?.includes("@");
        for (const username of notifyTargets) {
          const user = await prisma.user.findFirst({ where: { username }, select: { id: true } });
          if (user) {
            await notif.createNotification({
              userId: user.id,
              type: isMention ? "MENTIONED" : "COMMENTED",
              reqId,
              content: `${author} 评论了需求「${req.title}」：${body.content?.slice(0, 50)}`,
            }).catch(() => {});
          }
        }
      }

      return c.json(comment, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/comments/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    if (!(await canDeleteComment(c, id))) return c.json({ error: "无权删除该评论" }, 403);
    try {
      await collab.deleteComment(id);
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "操作失败" }, 400);
    }
  });

  // ================= Relations =================

  app.get("/:reqId/relations", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const relations = await collab.listRelations(reqId);
    return c.json(relations);
  });

  app.post("/:reqId/relations", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    if (!(await canEditReq(c, reqId))) return c.json({ error: "无权为该需求添加关联" }, 403);
    const body = await c.req.json();
    if (!body.toReqId) return c.json({ error: "请选择关联需求" }, 400);
    if (!body.relType) return c.json({ error: "请选择关联类型" }, 400);
    try {
      const relation = await collab.createRelation({
        fromReqId: reqId,
        toReqId: body.toReqId,
        relType: body.relType,
      });
      return c.json(relation, 201);
    } catch {
      return c.json({ error: "操作失败" }, 400);
    }
  });

  app.delete("/relations/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const relation = await prisma.reqRelation.findUnique({ where: { id }, select: { fromReqId: true } });
    if (!relation) return c.json({ error: "关联不存在" }, 404);
    if (!(await canEditReq(c, relation.fromReqId))) return c.json({ error: "无权删除该关联" }, 403);
    try {
      await collab.deleteRelation(id);
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "操作失败" }, 400);
    }
  });

  // ================= Search Requirements (for relation picker) =================

  app.get("/search", async (c) => {
    const q = c.req.query("q") || "";
    const limit = parseInt(c.req.query("limit") || "10");
    const results = await collab.searchRequirements(q, limit);
    return c.json(results);
  });

  // ================= Attachments =================

  app.get("/:reqId/attachments", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const attachments = await prisma.attachment.findMany({
      where: { reqId },
      orderBy: { createdAt: "desc" },
    });
    return c.json(attachments.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })));
  });

  app.post("/:reqId/attachments", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const uploadedBy = (c.get("username") as string) || "anonymous";

    try {
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!file || typeof file === "string" || !file.arrayBuffer) {
        return c.json({ error: "请上传文件" }, 400);
      }

      // sanitize: 取文件名最后一段，清除路径分隔符和危险字符
      const safeFileName = path.basename((file.name || "unknown").replace(/[^\w一-鿿.\-]/g, "_"));
      const buffer = Buffer.from(await file.arrayBuffer());
      const timestamp = Date.now();
      const uniqueName = `${timestamp}_${safeFileName}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);

      fs.writeFileSync(filePath, buffer);

      const attachment = await prisma.attachment.create({
        data: {
          reqId,
          fileName: safeFileName,
          filePath: uniqueName,
          fileSize: buffer.length,
          mimeType: file.type || "application/octet-stream",
          uploadedBy,
        },
      });

      return c.json({ ...attachment, createdAt: attachment.createdAt.toISOString() }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.get("/attachments/:id/download", async (c) => {
    const id = parseInt(c.req.param("id"));
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return c.json({ error: "附件不存在" }, 404);

    const filePath = path.join(UPLOAD_DIR, attachment.filePath);
    // 防路径穿越：确保解析后路径在 UPLOAD_DIR 内
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR) + path.sep) &&
        resolvedPath !== path.resolve(UPLOAD_DIR)) {
      return c.json({ error: "非法文件路径" }, 403);
    }
    if (!fs.existsSync(resolvedPath)) return c.json({ error: "文件不存在" }, 404);

    const buffer = fs.readFileSync(resolvedPath);
    c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.fileName)}"`);
    c.header("Content-Type", attachment.mimeType || "application/octet-stream");
    return c.body(buffer);
  });

  app.delete("/attachments/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return c.json({ error: "附件不存在" }, 404);
    if (!(await canEditReq(c, attachment.reqId))) return c.json({ error: "无权删除该附件" }, 403);

    const filePath = path.join(UPLOAD_DIR, attachment.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.attachment.delete({ where: { id } });
    return c.json({ ok: true });
  });

  // ================= Documents =================

  app.get("/:reqId/documents", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const documents = await prisma.document.findMany({
      where: { reqId },
      orderBy: { createdAt: "desc" },
    });
    return c.json(documents.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
  });

  // POST /:reqId/documents/upload — Upload MD/HTML file and create Document record
  app.post("/:reqId/documents/upload", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    if (!(await canEditReq(c, reqId))) return c.json({ error: "无权为该需求上传文档" }, 403);
    const actor = (c.get("username") as string) || "anonymous";

    try {
      const body = await c.req.parseBody();
      const file = body["file"];
      const docType = (body["docType"] as string) || "其他";

      if (!file || typeof file === "string" || !file.arrayBuffer) {
        return c.json({ error: "请上传文件" }, 400);
      }

      if (!VALID_DOC_TYPES.includes(docType)) {
        return c.json({ error: "文档类型无效，请选择 BRD / FSD / PRD / 数据模型设计" }, 400);
      }

      const fileName = (file as { name?: string }).name || "unknown";
      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_DOC_EXTS.includes(ext)) {
        return c.json({ error: "仅支持 .md / .html / .htm / .docx / .xlsx / .xls 格式文件" }, 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_DOC_SIZE) {
        return c.json({ error: "文件大小不能超过 10MB" }, 400);
      }

      // Save to uploads/req-docs/{reqId}/
      const reqDir = path.join(REQ_DOC_UPLOAD_DIR, String(reqId));
      fs.mkdirSync(reqDir, { recursive: true });

      const sanitizedName = sanitizeDocFileName(fileName);
      const uniqueName = `${Date.now()}_${sanitizedName}`;
      const filePath = path.join(reqDir, uniqueName);
      fs.writeFileSync(filePath, buffer);

      // Store relative path (with uploads/ prefix for preview to resolve correctly)
      const relativePath = `uploads/req-docs/${reqId}/${uniqueName}`;

      const doc = await prisma.document.create({
        data: {
          reqId,
          docName: fileName.replace(ext, ""),
          docPath: relativePath,
          docType,
        },
      });

      // 🔥 Index into RAG knowledge base (fire-and-forget, non-blocking)
      indexDocumentInRAG(doc.id)
        .then((r) => {
          if (r) console.log(`[collaboration] RAG indexed: ${r.chunks} chunks for doc ${doc.id}`);
        })
        .catch((err) => console.error(`[collaboration] RAG indexing failed:`, err));

      return c.json({ ...doc, createdAt: doc.createdAt.toISOString(), ragIndexed: true }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /documents/:id/preview — Read file content for preview
  app.get("/documents/:id/preview", async (c) => {
    const id = parseInt(c.req.param("id"));
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return c.json({ error: "文档不存在" }, 404);

    // External URL
    if (doc.docPath && (doc.docPath.startsWith("http://") || doc.docPath.startsWith("https://"))) {
      return c.json({ isExternal: true, url: doc.docPath, docType: doc.docType, docName: doc.docName });
    }

    // Local file
    if (!doc.docPath) {
      return c.json({ isExternal: false, content: null, mimeType: "text/plain", fileName: doc.docName, docType: doc.docType });
    }

    const fullPath = path.resolve(process.cwd(), doc.docPath);
    // 防路径穿越：文件必须在 uploads 目录内
    const allowedBase = path.resolve(process.cwd(), "uploads");
    if (!fullPath.startsWith(allowedBase + path.sep) && fullPath !== allowedBase) {
      return c.json({ error: "非法文件路径" }, 403);
    }
    if (!fs.existsSync(fullPath)) {
      return c.json({ error: "文件不存在，可能已被删除" }, 404);
    }

    const ext = path.extname(doc.docPath).toLowerCase();

    // Handle .docx — convert to HTML using mammoth
    if (ext === ".docx") {
      try {
        const mammoth = await import("mammoth");
        const buffer = fs.readFileSync(fullPath);
        const result = await mammoth.convertToHtml({ buffer });
        return c.json({
          isExternal: false,
          content: result.value,
          mimeType: "text/html",
          fileName: doc.docName,
          docType: doc.docType,
        });
      } catch (err) {
        return c.json({ error: "Word 文档解析失败：" + (err as Error).message }, 500);
      }
    }

    // Handle .xlsx / .xls — convert to HTML table using xlsx
    if (ext === ".xlsx" || ext === ".xls") {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.readFile(fullPath);
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) return c.json({ error: "Excel 文件没有工作表" }, 400);
        const sheet = workbook.Sheets[firstSheet];
        const html = XLSX.utils.sheet_to_html(sheet, { id: "excel-preview", editable: false });
        const styledHtml = `<div class="excel-preview">${html}</div>`;
        return c.json({
          isExternal: false,
          content: styledHtml,
          mimeType: "text/html",
          fileName: doc.docName,
          docType: doc.docType,
        });
      } catch (err) {
        return c.json({ error: "Excel 文件解析失败：" + (err as Error).message }, 500);
      }
    }

    // .md / .html / .htm — read as text
    const content = fs.readFileSync(fullPath, "utf-8");
    const mimeType = getMimeType(ext);

    return c.json({ isExternal: false, content, mimeType, fileName: doc.docName, docType: doc.docType });
  });

  app.post("/:reqId/documents", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const body = await c.req.json();
    if (!body.docName?.trim()) return c.json({ error: "文档名称不能为空" }, 400);
    if (!body.docType) return c.json({ error: "请选择文档类型" }, 400);
    if (!VALID_DOC_TYPES.includes(body.docType)) {
      return c.json({ error: "文档类型无效" }, 400);
    }

    try {
      const doc = await prisma.document.create({
        data: {
          reqId,
          docName: body.docName.trim(),
          docPath: body.docPath || null,
          docType: body.docType,
        },
      });
      return c.json({ ...doc, createdAt: doc.createdAt.toISOString() }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  app.delete("/documents/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return c.json({ error: "文档不存在" }, 404);
    if (!(await canEditReq(c, doc.reqId))) return c.json({ error: "无权删除该文档" }, 403);

    // Delete file from disk if it's a local path
    if (doc.docPath && !doc.docPath.startsWith("http://") && !doc.docPath.startsWith("https://")) {
      const fullPath = path.join(process.cwd(), doc.docPath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        // Try to remove empty parent directory
        const parentDir = path.dirname(fullPath);
        try { fs.rmdirSync(parentDir); } catch { /* not empty or already removed */ }
      }
    }

    // Remove from RAG knowledge base
    await removeDocumentFromRAG(id);

    await prisma.document.delete({ where: { id } });
    return c.json({ ok: true });
  });

  // POST /documents/:id/reindex — Re-index a document into RAG KB
  app.post("/documents/:id/reindex", async (c) => {
    const id = parseInt(c.req.param("id"));
    const doc = await prisma.document.findUnique({ where: { id }, select: { reqId: true } });
    if (!doc) return c.json({ error: "文档不存在" }, 404);
    if (!(await canEditReq(c, doc.reqId))) return c.json({ error: "无权操作该文档" }, 403);
    const result = await indexDocumentInRAG(id);
    if (!result) return c.json({ error: "索引失败，请检查文件是否存在" }, 400);
    return c.json({ ok: true, chunks: result.chunks });
  });

  // GET /rag-stats — Show RAG KB stats
  app.get("/rag-stats", async (c) => {
    const kbs = await prisma.knowledgeBase.findMany({
      where: { enabled: true },
      include: {
        documents: {
          include: { chunks: { select: { id: true } } },
        },
      },
    });

    const stats = kbs.map((kb) => ({
      id: kb.id,
      name: kb.displayName,
      docCount: kb.documents.length,
      chunkCount: kb.documents.reduce((sum, d) => sum + d.chunks.length, 0),
      lastSyncedAt: kb.lastSyncedAt?.toISOString() || null,
    }));

    return c.json(stats);
  });

  // ================= Test Cases =================

  // GET /:reqId/test-cases — List test cases for a requirement
  app.get("/:reqId/test-cases", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const cases = await prisma.testCase.findMany({
      where: { reqId },
      orderBy: { caseNo: "asc" },
    });
    return c.json(cases.map(tc => ({
      ...tc,
      steps: tc.steps as unknown,
      createdAt: tc.createdAt.toISOString(),
      updatedAt: tc.updatedAt.toISOString(),
    })));
  });

  // POST /:reqId/test-cases — Create a manual test case
  app.post("/:reqId/test-cases", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const body = await c.req.json();
    const actor = (c.get("username") as string) || "anonymous";

    if (!body.title?.trim()) return c.json({ error: "测试标题不能为空" }, 400);
    if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
      return c.json({ error: "测试步骤不能为空" }, 400);
    }

    // Generate case number
    const count = await prisma.testCase.count({ where: { reqId } });
    const caseNo = `TC-${String(count + 1).padStart(3, "0")}`;

    const tc = await prisma.testCase.create({
      data: {
        reqId,
        caseNo: body.caseNo || caseNo,
        title: body.title.trim(),
        precondition: body.precondition || null,
        steps: body.steps as any,
        priority: body.priority || "P2",
        source: "manual",
        createdBy: actor,
      },
    });

    return c.json({ ...tc, steps: tc.steps as unknown, createdAt: tc.createdAt.toISOString(), updatedAt: tc.updatedAt.toISOString() }, 201);
  });

  // PUT /test-cases/:id — Update a test case (only manual source)
  app.put("/test-cases/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const existing = await prisma.testCase.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "测试用例不存在" }, 404);
    if (existing.source !== "manual") return c.json({ error: "AI 生成的测试用例不可编辑" }, 403);

    const body = await c.req.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) { if (!body.title?.trim()) return c.json({ error: "标题不能为空" }, 400); data.title = body.title.trim(); }
    if (body.precondition !== undefined) data.precondition = body.precondition || null;
    if (body.steps !== undefined) data.steps = body.steps as any;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.caseNo !== undefined) data.caseNo = body.caseNo;

    const tc = await prisma.testCase.update({ where: { id }, data });
    return c.json({ ...tc, steps: tc.steps as unknown, createdAt: tc.createdAt.toISOString(), updatedAt: tc.updatedAt.toISOString() });
  });

  // DELETE /test-cases/:id — Delete a test case
  app.delete("/test-cases/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const existing = await prisma.testCase.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "测试用例不存在" }, 404);
    // Also delete associated test runs
    await prisma.testRun.deleteMany({ where: { testCaseId: id } });
    await prisma.testCase.delete({ where: { id } });
    return c.json({ ok: true });
  });

  // DELETE /:reqId/test-cases — Delete ALL test cases for a requirement
  app.delete("/:reqId/test-cases", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const count = await prisma.testCase.count({ where: { reqId } });
    if (count === 0) return c.json({ error: "没有可删除的测试用例" }, 400);
    await prisma.testRun.deleteMany({ where: { testCase: { reqId } } });
    await prisma.regressionSuiteItem.deleteMany({ where: { testCase: { reqId } } });
    await prisma.testCase.deleteMany({ where: { reqId } });
    return c.json({ ok: true, deleted: count });
  });

  // ================= Test Runs =================

  const TEST_RUN_UPLOAD_DIR = path.join(process.cwd(), "uploads", "test-runs");

  // GET /test-cases/:id/runs — List all test runs for a test case
  app.get("/test-cases/:id/runs", async (c) => {
    const tcId = parseInt(c.req.param("id"));
    const runs = await prisma.testRun.findMany({
      where: { testCaseId: tcId },
      orderBy: { createdAt: "desc" },
    });
    return c.json(runs.map(r => ({
      ...r,
      screenshots: r.screenshots as unknown,
      createdAt: r.createdAt.toISOString(),
    })));
  });

  // POST /test-cases/:id/runs — Record a test run with optional screenshots
  app.post("/test-cases/:id/runs", async (c) => {
    const tcId = parseInt(c.req.param("id"));
    const actor = (c.get("username") as string) || "anonymous";

    try {
      const body = await c.req.parseBody();
      const status = (body["status"] as string) || "passed";
      const result = (body["result"] as string) || null;

      if (!["pending", "passed", "failed", "blocked"].includes(status)) {
        return c.json({ error: "无效的执行状态" }, 400);
      }

      // Create the test run first to get its ID
      const run = await prisma.testRun.create({
        data: {
          testCaseId: tcId,
          status,
          result: result?.trim() || null,
          createdBy: actor,
        },
      });

      // Handle screenshot uploads
      const files = body["screenshots"];
      const fileArray = Array.isArray(files) ? files : files ? [files] : [];
      const screenshotPaths: string[] = [];

      if (fileArray.length > 0) {
        const runDir = path.join(TEST_RUN_UPLOAD_DIR, String(run.id));
        fs.mkdirSync(runDir, { recursive: true });

        for (const file of fileArray) {
          if (!(file instanceof File)) continue;
          const ext = path.extname(file.name).toLowerCase();
          if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) continue;
          if (file.size > 5 * 1024 * 1024) continue; // max 5MB per screenshot

          const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_")}`;
          const filePath = path.join(runDir, safeName);
          const buffer = Buffer.from(await file.arrayBuffer());
          fs.writeFileSync(filePath, buffer);
          screenshotPaths.push(`uploads/test-runs/${run.id}/${safeName}`);
        }
      }

      // Update with screenshot paths
      if (screenshotPaths.length > 0) {
        await prisma.testRun.update({
          where: { id: run.id },
          data: { screenshots: screenshotPaths as any },
        });
      }

      return c.json({
        ...run,
        screenshots: screenshotPaths.length > 0 ? screenshotPaths : null,
        createdAt: run.createdAt.toISOString(),
      }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /test-runs/screenshots/* — Serve screenshot files
  app.get("/test-runs/screenshots/:runId/:filename", async (c) => {
    const runId = c.req.param("runId");
    const filename = c.req.param("filename");
    const filePath = path.join(TEST_RUN_UPLOAD_DIR, runId, filename);

    // Prevent directory traversal
    if (!filePath.startsWith(TEST_RUN_UPLOAD_DIR)) {
      return c.json({ error: "非法路径" }, 403);
    }
    if (!fs.existsSync(filePath)) return c.json({ error: "文件不存在" }, 404);

    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
    c.header("Content-Type", mimeMap[ext] || "application/octet-stream");
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(fs.readFileSync(filePath));
  });

  // DELETE /test-runs/:id — Delete a test run and its screenshots
  app.delete("/test-runs/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const run = await prisma.testRun.findUnique({ where: { id } });
    if (!run) return c.json({ error: "执行记录不存在" }, 404);

    // Clean up screenshot files
    const runDir = path.join(TEST_RUN_UPLOAD_DIR, String(id));
    if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true });

    await prisma.testRun.delete({ where: { id } });
    return c.json({ ok: true });
  });

  // ================= Regression Suites =================

  app.get("/:reqId/regression-suites", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const suites = await prisma.regressionSuite.findMany({
      where: { reqId },
      orderBy: { updatedAt: "desc" },
      include: {
        items: { include: { testCase: { select: { id: true, caseNo: true, title: true, priority: true } } } },
        runs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, passCount: true, failCount: true, totalCount: true, status: true, createdAt: true } },
      },
    });
    return c.json(suites.map(s => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      latestRun: s.runs[0] || null,
      items: s.items.map(i => ({ id: i.id, testCaseId: i.testCaseId, testCase: i.testCase, sortOrder: i.sortOrder })),
    })));
  });

  app.post("/:reqId/regression-suites", async (c) => {
    const reqId = parseInt(c.req.param("reqId"));
    const body = await c.req.json();
    const actor = (c.get("username") as string) || "anonymous";
    if (!body.name?.trim()) return c.json({ error: "套件名称不能为空" }, 400);
    if (!body.testCaseIds?.length) return c.json({ error: "请至少选择一条测试用例" }, 400);
    const dup = await prisma.regressionSuite.findFirst({ where: { reqId, name: body.name.trim() } });
    if (dup) return c.json({ error: "同一需求下套件名称不能重复" }, 400);
    const suite = await prisma.regressionSuite.create({ data: { reqId, name: body.name.trim(), description: body.description || null, createdBy: actor } });
    await prisma.regressionSuiteItem.createMany({
      data: (body.testCaseIds as number[]).map((tcId, i) => ({ suiteId: suite.id, testCaseId: tcId, sortOrder: i })),
    });
    return c.json({ ...suite, createdAt: suite.createdAt.toISOString(), updatedAt: suite.updatedAt.toISOString() }, 201);
  });

  app.delete("/regression-suites/:id", async (c) => {
    await prisma.regressionSuite.delete({ where: { id: parseInt(c.req.param("id")) } });
    return c.json({ ok: true });
  });

  app.put("/regression-suites/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    if (body.name !== undefined) await prisma.regressionSuite.update({ where: { id }, data: { name: body.name, description: body.description } });
    if (body.testCaseIds !== undefined) {
      await prisma.regressionSuiteItem.deleteMany({ where: { suiteId: id } });
      await prisma.regressionSuiteItem.createMany({ data: (body.testCaseIds as number[]).map((tcId, i) => ({ suiteId: id, testCaseId: tcId, sortOrder: i })) });
    }
    return c.json({ ok: true });
  });

  // ================= Regression Runs =================

  const REG_RUN_UPLOAD_DIR = path.join(process.cwd(), "uploads", "reg-runs");

  app.post("/regression-suites/:id/runs", async (c) => {
    const suiteId = parseInt(c.req.param("id"));
    const actor = (c.get("username") as string) || "anonymous";
    const suiteItems = await prisma.regressionSuiteItem.findMany({ where: { suiteId: suiteId }, include: { testCase: true }, orderBy: { sortOrder: "asc" } });
    if (suiteItems.length === 0) return c.json({ error: "套件中没有测试用例" }, 400);
    const run = await prisma.regressionRun.create({ data: { suiteId, totalCount: suiteItems.length, createdBy: actor, status: "running" } });
    await prisma.regressionRunItem.createMany({ data: suiteItems.map(i => ({ runId: run.id, testCaseId: i.testCaseId, status: "pending" })) });
    // Re-fetch to get generated IDs
    const runItems = await prisma.regressionRunItem.findMany({
      where: { runId: run.id },
      include: { testCase: { select: { id: true, caseNo: true, title: true, priority: true } } },
      orderBy: { id: "asc" },
    });
    return c.json({ ...run, createdAt: run.createdAt.toISOString(), items: runItems.map(ri => ({ id: ri.id, testCaseId: ri.testCaseId, status: ri.status, testCase: ri.testCase })) }, 201);
  });

  // POST /regression-run-items/:id/screenshots — Upload screenshots
  app.post("/regression-run-items/:id/screenshots", async (c) => {
    const itemId = parseInt(c.req.param("id"));
    const existing = await prisma.regressionRunItem.findUnique({ where: { id: itemId } });
    if (!existing) return c.json({ error: "不存在" }, 404);

    try {
      const body = await c.req.parseBody();
      const files = body["screenshots"];
      const fileArray = Array.isArray(files) ? files : files ? [files] : [];
      const runDir = path.join(REG_RUN_UPLOAD_DIR, String(existing.runId));
      fs.mkdirSync(runDir, { recursive: true });
      const newPaths: string[] = [];
      for (const file of fileArray) {
        if (!(file instanceof File)) continue;
        const ext = path.extname(file.name).toLowerCase();
        if (![".png",".jpg",".jpeg",".gif",".webp"].includes(ext)) continue;
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
        fs.writeFileSync(path.join(runDir, safeName), Buffer.from(await file.arrayBuffer()));
        newPaths.push(`uploads/reg-runs/${existing.runId}/${safeName}`);
      }
      const existingPaths = existing.screenshots ? (existing.screenshots as string[]) : [];
      const allPaths = [...existingPaths, ...newPaths];
      if (newPaths.length > 0) {
        await prisma.regressionRunItem.update({ where: { id: itemId }, data: { screenshots: allPaths as any } });
      }
      return c.json({ screenshots: allPaths });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /regression-runs/screenshots/:runId/:filename
  app.get("/regression-runs/screenshots/:runId/:filename", async (c) => {
    const runId = c.req.param("runId");
    const filename = c.req.param("filename");
    const filePath = path.join(REG_RUN_UPLOAD_DIR, runId, filename);
    if (!filePath.startsWith(REG_RUN_UPLOAD_DIR)) return c.json({ error: "非法路径" }, 403);
    if (!fs.existsSync(filePath)) return c.json({ error: "文件不存在" }, 404);
    const ext = path.extname(filename).toLowerCase();
    c.header("Content-Type", { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".gif":"image/gif", ".webp":"image/webp" }[ext] || "application/octet-stream");
    return c.body(fs.readFileSync(filePath));
  });

  app.get("/regression-runs/:id", async (c) => {
    const run = await prisma.regressionRun.findUnique({
      where: { id: parseInt(c.req.param("id")) },
      include: { items: { include: { testCase: { select: { id: true, caseNo: true, title: true, priority: true } } }, orderBy: { id: "asc" } } },
    });
    if (!run) return c.json({ error: "执行记录不存在" }, 404);
    return c.json({ ...run, createdAt: run.createdAt.toISOString(), items: run.items.map(i => ({ ...i, screenshots: i.screenshots as unknown, createdAt: i.createdAt.toISOString() })) });
  });

  app.put("/regression-run-items/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const existing = await prisma.regressionRunItem.findUnique({ where: { id } });
    if (!existing) return c.json({ error: "不存在" }, 404);

    const updateData: { status?: string; result?: string | null; screenshots?: any } = {};
    if (body.status) {
      if (!["passed","failed","blocked"].includes(body.status)) return c.json({ error: "无效状态" }, 400);
      updateData.status = body.status;
    }
    if (body.result !== undefined) updateData.result = body.result || null;
    if (body.screenshots !== undefined) updateData.screenshots = body.screenshots;

    await prisma.regressionRunItem.update({ where: { id }, data: updateData });

    // Update run counters
    const runItems = await prisma.regressionRunItem.findMany({ where: { runId: existing.runId }, select: { status: true } });
    const runDone = runItems.every(i => i.status !== "pending");
    const updateRunData: { passCount: number; failCount: number; blockedCount: number; status: string } = {
      passCount: runItems.filter(i => i.status === "passed").length,
      failCount: runItems.filter(i => i.status === "failed").length,
      blockedCount: runItems.filter(i => i.status === "blocked").length,
      status: runDone ? "completed" : "running",
    };
    await prisma.regressionRun.update({ where: { id: existing.runId }, data: updateRunData });
    return c.json({ ok: true });
  });

  return app;
}
