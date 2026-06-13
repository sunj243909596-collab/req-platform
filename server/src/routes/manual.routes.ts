import { Hono } from "hono";
import { requireRole } from "../middleware/auth";
import * as manualService from "../services/manual.service";
import { indexManualInRAG, removeManualFromRAG } from "../services/manual-rag-indexer.service";
import { prisma } from "../lib/prisma";
import fs from "fs";
import path from "path";


const UPLOAD_DIR = path.join(process.cwd(), "uploads", "manuals");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTS = [".pdf", ".docx", ".xlsx", ".xls", ".md", ".txt"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function createManualRoutes() {
  const app = new Hono();

  // ==================== Category CRUD ====================

  // GET /categories — list all categories
  app.get("/categories", async (c) => {
    try {
      const categories = await prisma.manualCategory.findMany({
        orderBy: { sortOrder: "asc" },
      });
      return c.json(categories);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // POST /categories — create category (ADMIN only)
  app.post("/categories", requireRole("ADMIN"), async (c) => {
    try {
      const body = await c.req.json();
      if (!body.name?.trim()) return c.json({ error: "分类名称不能为空" }, 400);
      const max = await prisma.manualCategory.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
      const cat = await prisma.manualCategory.create({
        data: {
          name: body.name.trim(),
          sortOrder: (max?.sortOrder ?? -1) + 1,
          createdBy: c.get("username") as string,
        },
      });
      return c.json(cat, 201);
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return c.json({ error: "分类名称已存在" }, 409);
      }
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // PUT /categories/:id — update category name (ADMIN only)
  app.put("/categories/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const body = await c.req.json();
      if (!body.name?.trim()) return c.json({ error: "分类名称不能为空" }, 400);
      const cat = await prisma.manualCategory.update({
        where: { id },
        data: { name: body.name.trim() },
      });
      return c.json(cat);
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return c.json({ error: "分类名称已存在" }, 409);
      }
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // DELETE /categories/:id — delete category (ADMIN only)
  app.delete("/categories/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      await prisma.manualCategory.delete({ where: { id } });
      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // ==================== Manual CRUD ====================

  // GET / — list manuals
  app.get("/", async (c) => {
    try {
      const result = await manualService.listManuals({
        category: c.req.query("category"),
        type: c.req.query("type"),
        search: c.req.query("search"),
      });
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /:id — single manual
  app.get("/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const manual = await manualService.getManual(id);
      if (!manual) return c.json({ error: "操作手册不存在" }, 404);
      return c.json(manual);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // POST / — create article or link (ADMIN only)
  app.post("/", requireRole("ADMIN"), async (c) => {
    try {
      const body = await c.req.json();
      const manual = await manualService.createManual({
        title: body.title,
        content: body.content,
        type: body.type || "article",
        category: body.category || "SOP",
        tags: body.tags,
        externalUrl: body.externalUrl,
        sortOrder: body.sortOrder,
        createdBy: c.get("username") as string,
      });

      // Index into RAG KB (async, don't block response)
      if (manual.type === "article" || manual.type === "document") {
        indexManualInRAG(manual.id).then((result) => {
          if (result) console.log(`[manual-rag] Indexed manual ${manual.id} → ${result.chunks} chunks`);
        }).catch((err) => console.error(`[manual-rag] Index failed for manual ${manual.id}:`, err));
      }

      return c.json(manual, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // POST /upload — upload document file (ADMIN only, multipart)
  app.post("/upload", requireRole("ADMIN"), async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body["file"];
      const title = (body["title"] as string) || "";
      const category = (body["category"] as string) || "SOP";

      if (!file || typeof file === "string" || !(file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer) {
        return c.json({ error: "请上传文件" }, 400);
      }

      const f = file as { name?: string; type?: string; arrayBuffer: () => Promise<ArrayBuffer> };
      const fileName = f.name || "unknown";
      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        return c.json({ error: "仅支持 .pdf / .docx / .xlsx / .md / .txt 格式" }, 400);
      }

      const buffer = Buffer.from(await f.arrayBuffer());
      if (buffer.length > MAX_FILE_SIZE) {
        return c.json({ error: "文件大小不能超过 20MB" }, 400);
      }

      const sanitizedName = fileName.replace(/[^a-zA-Z0-9_一-鿿.-]/g, "_");
      const uniqueName = `${Date.now()}_${sanitizedName}`;
      const filePath = path.join(UPLOAD_DIR, uniqueName);
      fs.writeFileSync(filePath, buffer);

      const manual = await manualService.createManualDocument({
        title: title || fileName.replace(ext, ""),
        category,
        fileName,
        filePath: `uploads/manuals/${uniqueName}`,
        fileSize: buffer.length,
        mimeType: f.type || "application/octet-stream",
        createdBy: c.get("username") as string,
      });

      // Index into RAG KB (async)
      indexManualInRAG(manual.id).then((result) => {
        if (result) console.log(`[manual-rag] Indexed uploaded doc ${manual.id} → ${result.chunks} chunks`);
      }).catch((err) => console.error(`[manual-rag] Index failed for upload ${manual.id}:`, err));

      return c.json(manual, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // PUT /:id — update manual (ADMIN only)
  app.put("/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const body = await c.req.json();
      const manual = await manualService.updateManual(id, {
        title: body.title,
        content: body.content,
        category: body.category,
        tags: body.tags,
        externalUrl: body.externalUrl,
        sortOrder: body.sortOrder,
        updatedBy: c.get("username") as string,
      });

      // Re-index into RAG KB if content changed
      if (body.content !== undefined || body.title !== undefined || body.category !== undefined) {
        indexManualInRAG(id).then((result) => {
          if (result) console.log(`[manual-rag] Re-indexed manual ${id} → ${result.chunks} chunks`);
        }).catch((err) => console.error(`[manual-rag] Re-index failed for manual ${id}:`, err));
      }

      return c.json(manual);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // DELETE /:id — delete manual including file cleanup (ADMIN only)
  app.delete("/:id", requireRole("ADMIN"), async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const manual = await manualService.deleteManual(id);

      // Remove from RAG KB
      removeManualFromRAG(id);

      // Clean up file if document type
      if (manual.type === "document" && manual.filePath) {
        const fullPath = path.join(process.cwd(), manual.filePath);
        if (fs.existsSync(fullPath)) {
          try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
          // Try to remove empty parent dir
          try { fs.rmdirSync(UPLOAD_DIR); } catch { /* ignore */ }
        }
      }

      return c.json({ success: true });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /download/:id — download uploaded document file
  app.get("/download/:id", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const manual = await manualService.getManual(id);
      if (!manual || manual.type !== "document" || !manual.filePath) {
        return c.json({ error: "文件不存在" }, 404);
      }
      const fullPath = path.join(process.cwd(), manual.filePath);
      if (!fs.existsSync(fullPath)) {
        return c.json({ error: "文件已被删除" }, 404);
      }
      const buffer = fs.readFileSync(fullPath);
      c.header("Content-Disposition", `attachment; filename="${encodeURIComponent(manual.fileName || "download")}"`);
      c.header("Content-Type", manual.mimeType || "application/octet-stream");
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(buffer);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  // GET /:id/preview — preview document content (for document type)
  app.get("/:id/preview", async (c) => {
    try {
      const id = parseInt(c.req.param("id"));
      if (isNaN(id)) return c.json({ error: "无效的 ID" }, 400);
      const manual = await manualService.getManual(id);
      if (!manual) return c.json({ error: "操作手册不存在" }, 404);

      // For article type, return markdown content directly
      if (manual.type === "article") {
        return c.json({
          content: manual.content || "",
          mimeType: "text/markdown",
          fileName: manual.title,
        });
      }

      // For document type, read and return file content
      if (manual.type === "document" && manual.filePath) {
        const fullPath = path.join(process.cwd(), manual.filePath);
        if (!fs.existsSync(fullPath)) {
          return c.json({ error: "文件已被删除" }, 404);
        }

        const ext = path.extname(manual.fileName || "").toLowerCase();
        const buffer = fs.readFileSync(fullPath);

        if (ext === ".md" || ext === ".txt") {
          return c.json({
            content: buffer.toString("utf-8"),
            mimeType: "text/markdown",
            fileName: manual.fileName,
          });
        }
        if (ext === ".html" || ext === ".htm") {
          return c.json({
            content: buffer.toString("utf-8"),
            mimeType: "text/html",
            fileName: manual.fileName,
          });
        }
        if (ext === ".pdf") {
          return c.json({
            content: null,
            mimeType: "application/pdf",
            fileName: manual.fileName,
            isPdf: true,
          });
        }
        if (ext === ".docx") {
          try {
            const mammoth = await import("mammoth");
            const result = await mammoth.convertToHtml({ buffer });
            return c.json({
              content: result.value,
              mimeType: "text/html",
              fileName: manual.fileName,
            });
          } catch {
            return c.json({
              content: null,
              mimeType: manual.mimeType,
              fileName: manual.fileName,
              message: "无法预览此文档格式，请下载后查看",
            });
          }
        }
        if (ext === ".xlsx" || ext === ".xls") {
          try {
            const xlsx = await import("xlsx");
            const workbook = xlsx.read(buffer, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const html = xlsx.utils.sheet_to_html(sheet);
            return c.json({
              content: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ddd;padding:8px;text-align:left;}th{background:#f5f5f5;font-weight:600;}</style></head><body>${html}</body></html>`,
              mimeType: "text/html",
              fileName: manual.fileName,
            });
          } catch {
            return c.json({
              content: null,
              mimeType: manual.mimeType,
              fileName: manual.fileName,
              message: "无法预览此文档格式，请下载后查看",
            });
          }
        }

        return c.json({
          content: null,
          mimeType: manual.mimeType,
          fileName: manual.fileName,
          message: "不支持预览此文件格式，请下载后查看",
        });
      }

      // For link type
      if (manual.type === "link" && manual.externalUrl) {
        return c.json({
          content: null,
          mimeType: "text/link",
          fileName: manual.title,
          externalUrl: manual.externalUrl,
        });
      }

      return c.json({ error: "无可预览内容" }, 404);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return app;
}
