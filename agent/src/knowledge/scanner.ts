// File system scanner for knowledge base sources
// Recursively walks directories, detects changes via SHA256 hash

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface ScannedFile {
  fileName: string;
  filePath: string;        // Full path
  relativePath: string;    // Relative to knowledge base basePath
  fileSize: number;
  fileHash: string;
  mimeType: string;
  docType: string;
  status: "new" | "modified" | "unchanged" | "deleted";
}

export interface ScanOptions {
  extensions: string[];
  excludeDirs: string[];
  maxFileSize: number;     // bytes, skip files larger than this
}

const DEFAULT_OPTIONS: ScanOptions = {
  extensions: [".md", ".txt", ".sql", ".java", ".vue", ".ts", ".tsx", ".pdf"],
  excludeDirs: ["node_modules", ".git", "dist", ".next", "__pycache__", "target"],
  maxFileSize: 2 * 1024 * 1024, // 2MB
};

/** Scan a directory recursively, returning file metadata */
export function scanDirectory(basePath: string, options?: Partial<ScanOptions>): ScannedFile[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const files: ScannedFile[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!opts.excludeDirs.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!opts.extensions.includes(ext)) continue;

        const stat = fs.statSync(fullPath);
        if (stat.size > opts.maxFileSize) continue;

        const relativePath = path.relative(basePath, fullPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        const fileHash = sha256(content);

        files.push({
          fileName: entry.name,
          filePath: fullPath,
          relativePath,
          fileSize: stat.size,
          fileHash,
          mimeType: guessMimeType(ext),
          docType: guessDocType(entry.name, ext),
          status: "new",
        });
      }
    }
  }

  walk(basePath);
  return files;
}

/** Compare scanned files with existing index to determine status */
export function computeDelta(
  scanned: ScannedFile[],
  existing: Map<string, string>  // relativePath -> fileHash
): ScannedFile[] {
  const existingPaths = new Set(existing.keys());

  for (const file of scanned) {
    existingPaths.delete(file.relativePath);
    const oldHash = existing.get(file.relativePath);
    if (!oldHash) {
      file.status = "new";
    } else if (oldHash !== file.fileHash) {
      file.status = "modified";
    } else {
      file.status = "unchanged";
    }
  }

  // Files that exist in DB but not on disk
  for (const deletedPath of existingPaths) {
    scanned.push({
      fileName: path.basename(deletedPath),
      filePath: deletedPath,
      relativePath: deletedPath,
      fileSize: 0,
      fileHash: "",
      mimeType: "",
      docType: "",
      status: "deleted",
    });
  }

  return scanned;
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
}

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".sql": "text/x-sql",
    ".java": "text/x-java",
    ".vue": "text/x-vue",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".pdf": "application/pdf",
  };
  return map[ext] || "text/plain";
}

function guessDocType(fileName: string, ext: string): string {
  const name = fileName.toLowerCase();
  if (name.includes("brd") || name.includes("业务需求")) return "BRD";
  if (name.includes("fsd") || name.includes("功能规格")) return "FSD";
  if (name.includes("prd") || name.includes("产品需求")) return "PRD";
  if (name.includes("gsp")) return "GSP";
  if (name.includes("数据表") || name.includes("schema")) return "TABLE_DICT";
  if (ext === ".sql") return "SQL";
  if (ext === ".java") return "JAVA";
  if (ext === ".vue") return "VUE";
  if (ext === ".ts" || ext === ".tsx") return "TYPESCRIPT";
  if (ext === ".pdf") return "PDF";
  return "OTHER";
}
