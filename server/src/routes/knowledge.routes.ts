// Knowledge base management routes
import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as fs from "fs";
import * as path from "path";
import type { AgentDataStore } from "../services/agent.service";
import { dispatchKbSync, syncKnowledgeBase } from "../services/agent.service";
import { smartSearch } from "../services/rag-search.service";
import { routeKnowledgeBases } from "../services/kb-router.service";
import { embedQueryText } from "../services/embedder.service";
import { startKbSyncJob, getSyncJob } from "../services/kb-sync-job.service";
import { getKbHealth } from "../services/kb-health.service";

const ALLOWED_EXT = [".md", ".txt", ".sql", ".java", ".vue", ".ts", ".tsx", ".pdf"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export function createKnowledgeRoutes(store: AgentDataStore) {
  const app = new Hono();

  // List knowledge bases
  app.get("/bases", async (c) => {
    const bases = await store.listKnowledgeBases();
    return c.json(bases);
  });

  // Create knowledge base
  app.post("/bases", async (c) => {
    const body = await c.req.json();
    if (!body.name) return c.json({ error: "知识库名称（name）不能为空" }, 400);
    const kb = await store.createKnowledgeBase({
      ...body,
      displayName: body.displayName || body.name,
    });
    return c.json(kb, 201);
  });

  // Update knowledge base
  app.put("/bases/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const role = c.get("role");
    if (
      (body.description !== undefined || body.routingExamples !== undefined) &&
      role !== "ADMIN"
    ) {
      return c.json({ error: "仅管理员可修改知识库路由说明或路由样例" }, 403);
    }
    try {
      await store.updateKnowledgeBase(id, body);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // Delete knowledge base (cascade chunks)
  app.delete("/bases/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await store.deleteKnowledgeBase(id);
    return c.json({ ok: true });
  });

  // Sync knowledge base（?async=1 返回 jobId，后台索引）
  app.post("/bases/:id/sync", async (c) => {
    const id = parseInt(c.req.param("id"));
    const kb = await store.getKnowledgeBase(id);
    if (!kb) return c.json({ error: "Knowledge base not found" }, 404);

    const asyncMode = c.req.query("async") === "1" || c.req.query("async") === "true";

    if (asyncMode) {
      const jobId = startKbSyncJob(id, { basePath: kb.basePath, docType: kb.docType }, store);
      return c.json({ ok: true, async: true, jobId });
    }

    try {
      const result = await dispatchKbSync(id, { basePath: kb.basePath, docType: kb.docType }, store);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 500);
    }
  });

  // 异步同步任务状态
  app.get("/sync/jobs/:jobId", async (c) => {
    const job = getSyncJob(c.req.param("jobId"));
    if (!job) return c.json({ error: "任务不存在" }, 404);
    return c.json(job);
  });

  // KB health check: document/chunk counts, null-embedding rate, zero-chunk docs
  app.get("/bases/:id/health", async (c) => {
    const id = parseInt(c.req.param("id"));
    try {
      const health = await getKbHealth(id);
      return c.json(health);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // Get sync status
  app.get("/bases/:id/status", async (c) => {
    const id = parseInt(c.req.param("id"));
    const status = await store.getKnowledgeBaseStatus(id);
    return c.json(status);
  });

  // Upload files to knowledge base (upload mode)
  // Uses Hono's built-in multipart parsing — no multer needed
  app.post("/bases/:id/upload", async (c) => {
    const id = parseInt(c.req.param("id"));
    const kb = await store.getKnowledgeBase(id);
    if (!kb) return c.json({ error: "Knowledge base not found" }, 404);

    const uploadBasePath = path.posix.join("uploads", "kb", String(id));
    const uploadDir = path.resolve(process.cwd(), uploadBasePath);
    fs.mkdirSync(uploadDir, { recursive: true });

    if (kb.sourceType !== "upload" || kb.basePath !== uploadBasePath) {
      await store.updateKnowledgeBase(id, {
        sourceType: "upload",
        basePath: uploadBasePath,
      });
    }

    try {
      // Parse multipart form data
      const body = await c.req.parseBody();
      const files = body["files"];
      const fileArray = Array.isArray(files) ? files : files ? [files] : [];

      if (fileArray.length === 0) {
        return c.json({ ok: false, error: "未上传任何文件" }, 400);
      }

      const uploadedNames: string[] = [];

      for (const file of fileArray) {
        // Hono returns File objects from parseBody
        if (!(file instanceof File)) continue;

        const ext = path.extname(file.name).toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
          return c.json({ ok: false, error: `不支持的文件类型: ${ext}，仅支持 ${ALLOWED_EXT.join(", ")}` }, 400);
        }

        if (file.size > MAX_FILE_SIZE) {
          return c.json({ ok: false, error: `文件 ${file.name} 超过 2MB 限制` }, 400);
        }

        // Sanitize filename
        const safeName = file.name.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
        const filePath = path.join(uploadDir, safeName);

        // Save file
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        uploadedNames.push(file.name);
      }

      if (uploadedNames.length === 0) {
        return c.json({ ok: false, error: "未找到有效文件" }, 400);
      }

      // Auto-sync after upload
      const result = await syncKnowledgeBase(id, uploadDir, store);

      return c.json({
        ok: true,
        ...result,
        uploadedFiles: uploadedNames,
      });
    } catch (err) {
      return c.json({ ok: false, error: (err as Error).message }, 500);
    }
  });

  // Search knowledge base（与对话/分析共用 smartSearch：向量优先 + 关键词兜底）
  app.get("/search", async (c) => {
    const q = c.req.query("q") || "";
    const topK = parseInt(c.req.query("topK") || "10", 10);
    const kbIdRaw = c.req.query("kbId");
    const kbId = kbIdRaw ? parseInt(kbIdRaw, 10) : undefined;

    if (!q.trim()) {
      return c.json({ error: "参数 q 不能为空" }, 400);
    }

    const docType = c.req.query("docType")?.trim() || undefined;
    const pathPrefix = c.req.query("pathPrefix")?.trim() || undefined;

    const { chunks, routing, rerankMethod } = await smartSearch(q, store, embedQueryText, {
      topK,
      kbId: kbId && !Number.isNaN(kbId) ? kbId : undefined,
      skipKbRouting: !!(kbId && !Number.isNaN(kbId)),
      docType,
      pathPrefix,
    });
    const hint = chunks.length === 0
      ? "未找到相关内容。知识库可能尚未同步（执行「同步」后生成向量索引），或当前查询词与已索引内容不匹配。"
      : undefined;
    return c.json({ results: chunks, routing, rerankMethod, ...(hint ? { hint } : {}) });
  });

  // 路由测试：仅做知识库选库，不检索分块（与对话前路由逻辑一致）
  app.post("/route-test", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { q?: string; kbId?: number };
    const q = (body.q || "").trim();
    if (!q) return c.json({ error: "参数 q 不能为空" }, 400);
    try {
      const routing = await routeKnowledgeBases(q, store, {
        explicitKbId: body.kbId,
      });
      const { buildKbRoutingCatalog } = await import("../services/kb-routing-prompt");
      const bases = await store.listKnowledgeBasesForRouting();
      const catalog = buildKbRoutingCatalog(bases);
      return c.json({ ...routing, catalogPreview: catalog });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  /** @deprecated 使用 /route-test；保留兼容 rag-regression */
  app.post("/route", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { q?: string; kbId?: number };
    const q = (body.q || c.req.query("q") || "").trim();
    if (!q) return c.json({ error: "参数 q 不能为空" }, 400);
    const routing = await routeKnowledgeBases(q, store, { explicitKbId: body.kbId });
    return c.json(routing);
  });

  // Download/view a KB file by its relativePath
  app.get("/file", async (c) => {
    const relativePath = c.req.query("path");
    if (!relativePath) return c.json({ error: "参数 path 不能为空" }, 400);

    // Look up filePath from KnowledgeDocument (which stores the real absolute path)
    const doc = await store.getKnowledgeDocumentByPath(relativePath);
    if (!doc) return c.json({ error: "文件不存在" }, 404);

    const filePath = doc.filePath;

    // Validate that filePath is within the uploads directory (prevent path traversal via DB)
    const allowedBase = path.resolve(process.cwd(), "uploads");
    const resolvedFilePath = path.resolve(filePath);
    if (!resolvedFilePath.startsWith(allowedBase + path.sep) && !resolvedFilePath.startsWith(allowedBase + "/")) {
      return c.json({ error: "非法文件路径" }, 403);
    }

    if (!fs.existsSync(resolvedFilePath)) return c.json({ error: "文件已索引但磁盘文件不存在" }, 404);

    const ext = path.extname(resolvedFilePath).toLowerCase();
    const allowedTextExts = [".md", ".txt", ".sql", ".java", ".vue", ".ts", ".tsx", ".json", ".xml", ".yaml", ".yml", ".csv"];
    if (!allowedTextExts.includes(ext)) {
      return c.json({ error: "不支持的文件类型预览，请下载查看" }, 400);
    }

    const content = fs.readFileSync(resolvedFilePath, "utf-8");
    return c.json({ content, fileName: doc.fileName, relativePath: doc.relativePath });
  });

  // Manually trigger rebuild of the "需求列表" RAG KB (indexes all active
  // requirements + releases). Used as the UI counterpart to startup reindex.
  app.post("/requirement-kb/rebuild", requireRole("ADMIN"), async (c) => {
    const { rebuildRequirementKb } = await import("../services/requirement-indexer.service");
    const result = await rebuildRequirementKb();
    return c.json({ ok: true, ...result });
  });

  return app;
}
