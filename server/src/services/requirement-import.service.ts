import XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import type {
  CreateRequirementInput,
  ImportPreviewRow,
  ImportPreviewResult,
  ImportResult,
  RequirementCategoryNode,
} from "shared-types";
import type { AuthContext } from "../utils/access";
import { parseSeqFromCustomReqNo, syncSeqCounters } from "../utils/req-no";
import { listCategoryTree } from "./requirement-category.service";


const MAX_ROWS = 500;
const VALID_PRIORITIES = ["P0", "P1", "P2", "P3"];

interface RawRow {
  "分类": unknown;
  "需求类型"?: unknown;
  "需求编码"?: unknown;
  "标题": unknown;
  "优先级": unknown;
  "状态"?: unknown;
  "模块"?: unknown;
  "负责人"?: unknown;
  "期望日期"?: unknown;
  "标签"?: unknown;
  "需求背景"?: unknown;
  "需求描述"?: unknown;
  "设计方案"?: unknown;
  "GSP影响"?: unknown;
  "相关表"?: unknown;
  [key: string]: unknown;
}

// 编码格式：大写字母开头，可含大写字母/数字/横线，长度 1-31
const REQ_NO_RE = /^[A-Z][A-Z0-9-]{0,30}$/;

interface CategoryFlat {
  id: number;
  name: string;
  path: string;
  reqTypeCode: string;
  isRoot: boolean;
}

// ================= Public API =================

/**
 * Parse Excel file buffer, validate rows, detect duplicates.
 * Does NOT write to the database.
 */
export async function previewImport(
  fileBuffer: Buffer,
  ctx: AuthContext
): Promise<ImportPreviewResult> {
  const { rows, typeRows, totalRows } = await parseAndValidateRows(fileBuffer, ctx);

  const validCount = rows.filter((r) => r.status === "valid").length;
  const invalidCount = rows.filter((r) => r.status === "invalid").length;
  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;

  return { totalRows, validCount, invalidCount, duplicateCount, rows };
}

/**
 * Core parser: read the Excel, load all reference data, validate each row.
 * Shared by previewImport (returns full status) and confirmImport (re-runs
 * server-side validation, never trusts client-supplied status).
 */
async function parseAndValidateRows(
  fileBuffer: Buffer,
  ctx: AuthContext
): Promise<{
  rows: ImportPreviewRow[];
  typeRows: { id: number; code: string; displayName: string }[];
  totalRows: number;
}> {
  // 1. Parse Excel
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });

  if (rawRows.length === 0) {
    throw new Error("Excel 文件中没有数据行");
  }
  if (rawRows.length > MAX_ROWS) {
    throw new Error(`单次最多导入 ${MAX_ROWS} 行，当前有 ${rawRows.length} 行`);
  }

  // 2. Load category tree for resolution
  const tree = await listCategoryTree();
  const categories = flattenCategoryTreeFull(tree);

  // 2b. Load enabled requirement types for resolution
  const typeRows = await prisma.requirementType.findMany({
    where: { enabled: true },
    select: { id: true, code: true, displayName: true },
  });

  // 2c. Load all workflow status names for status validation
  const workflowStatusRows = await prisma.workflowStatus.findMany({
    select: { name: true },
  });
  const validStatusNames = new Set(workflowStatusRows.map((s) => s.name));

  // 3. Load existing requirements for duplicate detection
  const existingReqs = await prisma.requirement.findMany({
    where: {
      isDeleted: false,
      ...(ctx.role !== "ADMIN" && ctx.groupName ? { groupName: ctx.groupName } : {}),
    },
    select: { id: true, title: true, categoryId: true },
  });
  const existingKeys = new Set(
    existingReqs.map((r) => `${r.title.toLowerCase().trim()}|${r.categoryId}`)
  );

  // 4. Process each row
  const rows: ImportPreviewRow[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const rowNumber = i + 2; // Excel row number (header is row 1)
    const errors: string[] = [];

    // Parse fields
    const data = parseRow(raw, errors);

    // Resolve reqType first — 分类路径在多种类型下可能重复，须先确定类型
    if (data.reqTypeInput) {
      const resolvedCode = resolveReqType(data.reqTypeInput, typeRows);
      if (resolvedCode) {
        data.reqType = resolvedCode;
        const row2 = typeRows.find((t) => t.code === resolvedCode);
        data.reqTypeLabel = row2?.displayName || resolvedCode;
      } else {
        const valid = typeRows.map((t) => t.displayName || t.code).join("/");
        errors.push(`需求类型"${data.reqTypeInput}"未识别，应为 ${valid} 或对应 code`);
      }
    } else {
      errors.push("需求类型必填");
    }

    // Resolve category (scoped by reqType when possible)
    if (data.categoryName) {
      const resolved = resolveCategory(data.categoryName, categories, data.reqType);
      if (resolved) {
        if (resolved.isRoot) {
          errors.push("分类不能选择类型根节点，请选择具体业务模块");
        } else {
          data.categoryId = resolved.id;
        }
      } else {
        const trimmed = (data.categoryName ?? "").trim();
        const scoped = data.reqType
          ? categories.filter((c) => c.reqTypeCode === data.reqType)
          : categories;
        const samePrefix = scoped.filter((c) => c.path.startsWith(trimmed + "/"));
        if (samePrefix.length > 1) {
          const hint = data.reqType
            ? `${data.reqTypeLabel ?? data.reqType}/${samePrefix[0].path.split("/").slice(1).join("/")}`
            : samePrefix[0].path;
          errors.push(`分类"${data.categoryName}"不唯一（匹配到 ${samePrefix.length} 个），请填写完整路径如"${hint}"`);
        } else {
          errors.push(`分类"${data.categoryName}"不存在，请填写正确的分类名称或路径`);
        }
      }
    }

    if (data.categoryId && data.reqType) {
      const cat = categories.find((c) => c.id === data.categoryId);
      if (cat && cat.reqTypeCode !== data.reqType) {
        errors.push(
          `分类与需求类型不匹配：分类属于「${cat.reqTypeCode}」，需求类型为「${data.reqType}」`
        );
      }
    }

    // Validate required fields
    if (!data.title?.trim()) {
      errors.push("标题不能为空");
    }
    if (!data.priority) {
      errors.push("优先级不能为空");
    } else if (!VALID_PRIORITIES.includes(data.priority)) {
      errors.push(`优先级无效，应为 ${VALID_PRIORITIES.join("/")}`);
    }
    if (!data.categoryId) {
      errors.push("分类不能为空或分类不存在");
    }
    // reqNo 必填 + 格式
    if (!data.reqNo) {
      errors.push("需求编码必填");
    } else if (!REQ_NO_RE.test(data.reqNo)) {
      errors.push("需求编码格式无效，应以大写字母开头，仅含大写字母/数字/横线，长度 1-31");
    }
    // 状态校验(可选;有值时必须匹配 WorkflowStatus.name)
    if (data.status && !validStatusNames.has(data.status)) {
      const valid = Array.from(validStatusNames).join("/");
      errors.push(`状态"${data.status}"未识别，应为 ${valid} 之一`);
    }

    // Duplicate detection
    const dupKey = data.title
      ? `${data.title.toLowerCase().trim()}|${data.categoryId ?? ""}`
      : null;
    const isDuplicate = !!(dupKey && existingKeys.has(dupKey));

    rows.push({
      rowNumber,
      data: data as Partial<CreateRequirementInput>,
      status: errors.length > 0 ? "invalid" : isDuplicate ? "duplicate" : "valid",
      errors,
    });
  }

  return { rows, typeRows, totalRows: rawRows.length };
}

/**
 * Confirm import: re-parse the uploaded Excel server-side, validate every row,
 * and write only server-validated valid rows to the database.
 *
 * The caller MUST pass the same file buffer used in previewImport; the body
 * field { rows } is accepted only for legacy compatibility and is ignored.
 * This way, no client-supplied status / data field is ever trusted.
 */
export async function confirmImport(
  fileBuffer: Buffer,
  _ignoredValidRows: ImportPreviewRow[] | null,
  ctx: AuthContext
): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  const createdRequirements: ImportResult["createdRequirements"] = [];
  const seqSyncEntries: { categoryId: number; reqTypeId: number; seq: number }[] = [];
  let skipCount = 0;

  // Re-run the full server-side validation pipeline.
  const { rows, typeRows } = await parseAndValidateRows(fileBuffer, ctx);

  // Build reqType code → id map for the per-row insert.
  const typeIdByCode = new Map(typeRows.map((t) => [t.code, t.id]));

  // Two layers of reqNo uniqueness:
  //   1. In-file dedup (handled below as we iterate)
  //   2. DB conflict — query existing reqNos once up front, in bulk
  const candidateReqNos = Array.from(
    new Set(
      rows
        .filter((r) => r.status === "valid" && r.data.reqNo)
        .map((r) => r.data.reqNo as string)
    )
  );
  const existingReqNos = new Set<string>();
  if (candidateReqNos.length > 0) {
    const existing = await prisma.requirement.findMany({
      where: { reqNo: { in: candidateReqNos } },
      select: { reqNo: true },
    });
    for (const r of existing) existingReqNos.add(r.reqNo);
  }
  const seenInFile = new Set<string>();

  for (const row of rows) {
    // Trust ONLY the server-computed status.
    if (row.status !== "valid" || !row.data.categoryId) {
      skipCount++;
      if (row.errors.length > 0) {
        errors.push({
          rowNumber: row.rowNumber,
          title: row.data.title || "(空)",
          error: row.errors.join("；"),
        });
      }
      continue;
    }

    // reqNo uniqueness checks
    if (!row.data.reqNo) {
      skipCount++;
      errors.push({ rowNumber: row.rowNumber, title: row.data.title || "(空)", error: "需求编码必填" });
      continue;
    }
    if (seenInFile.has(row.data.reqNo)) {
      skipCount++;
      errors.push({
        rowNumber: row.rowNumber,
        title: row.data.title || "(空)",
        error: `需求编码 "${row.data.reqNo}" 在文件内重复`,
      });
      continue;
    }
    if (existingReqNos.has(row.data.reqNo)) {
      skipCount++;
      errors.push({
        rowNumber: row.rowNumber,
        title: row.data.title || "(空)",
        error: `需求编码 "${row.data.reqNo}" 在系统中已存在`,
      });
      continue;
    }
    seenInFile.add(row.data.reqNo);

    try {
      // Resolve reqTypeId: prefer the user-entered code, fall back to category's reqTypeId
      let reqTypeId: number | null = null;
      if (row.data.reqType) {
        reqTypeId = typeIdByCode.get(row.data.reqType) ?? null;
      }
      if (reqTypeId == null && row.data.categoryId) {
        const cat = await prisma.requirementCategory.findUnique({
          where: { id: row.data.categoryId },
          select: { reqTypeId: true },
        });
        reqTypeId = cat?.reqTypeId ?? null;
      }

      const groupName =
        ctx.role === "ADMIN"
          ? (row.data.groupName || ctx.groupName || "")
          : ctx.groupName || row.data.groupName || "";
      if (!groupName) {
        throw new Error("未指定所属组");
      }
      const group = await prisma.group.findUnique({ where: { groupName } });
      if (!group) throw new Error(`所属组 "${groupName}" 不存在`);

      if (ctx.role !== "ADMIN" && ctx.groupName && groupName !== ctx.groupName) {
        throw new Error("无权在其他组创建需求");
      }

      // Direct create — bypasses createRequirement() / generateCustomReqNo()，
      // 使用用户填写的 reqNo；导入成功后按末段 seq 回填 type 计数器。
      const created = await prisma.requirement.create({
        data: {
          reqNo: row.data.reqNo!,
          categoryId: row.data.categoryId,
          reqTypeId: reqTypeId ?? undefined,
          title: row.data.title || "",
          priority: row.data.priority || "P2",
          status: row.data.status || "待评审",
          groupName,
          reporter: ctx.username,
          module: row.data.module || undefined,
          assignee: row.data.assignee || undefined,
          targetDate: row.data.targetDate ? new Date(row.data.targetDate) : undefined,
          tags: row.data.tags,
          gspImpact: row.data.gspImpact || "待评估",
          relatedTables: row.data.relatedTables || undefined,
          background: row.data.background || undefined,
          description: row.data.description || undefined,
          designSolution: row.data.designSolution || undefined,
        },
      });

      await prisma.activityLog.create({
        data: {
          reqId: created.id,
          actor: ctx.username,
          action: "CREATED",
          detail: { reqNo: created.reqNo, title: created.title, source: "import" },
        },
      });

      createdRequirements.push({ reqNo: created.reqNo, title: created.title, id: created.id });

      if (created.categoryId != null && created.reqTypeId != null) {
        const seq = parseSeqFromCustomReqNo(created.reqNo);
        if (seq != null) {
          seqSyncEntries.push({
            categoryId: created.categoryId,
            reqTypeId: created.reqTypeId,
            seq,
          });
        }
      }
    } catch (err) {
      errors.push({
        rowNumber: row.rowNumber,
        title: row.data.title || "(空)",
        error: (err as Error).message,
      });
    }
  }

  if (seqSyncEntries.length > 0) {
    await syncSeqCounters(prisma, seqSyncEntries);
  }

  return {
    successCount: createdRequirements.length,
    skipCount,
    errors,
    createdRequirements,
  };
}

// ================= Internal helpers =================

/**
 * Recursively flatten the category tree into a flat array with paths.
 */
function flattenCategoryTreeFull(
  nodes: RequirementCategoryNode[],
  parentPath = "",
  reqTypeCode = ""
): CategoryFlat[] {
  const result: CategoryFlat[] = [];
  for (const node of nodes) {
    const typeCode = node.isRoot ? node.reqType : reqTypeCode;
    const path = parentPath ? `${parentPath}/${node.name}` : node.name;
    result.push({
      id: node.id,
      name: node.name,
      path,
      reqTypeCode: typeCode,
      isRoot: node.isRoot,
    });
    if (node.children && node.children.length > 0) {
      result.push(...flattenCategoryTreeFull(node.children, path, typeCode));
    }
  }
  return result;
}

/**
 * Resolve category name to a category ID.
 *
 * Strict matching: exact path first, then exact name. Fuzzy substring match
 * is intentionally removed to prevent silent mis-routing when two categories
 * share a substring (e.g. "用户管理" vs "管理员权限"). When a partial path
 * prefix matches multiple categories, returns null with the caller emitting a
 * specific "use the full path" error.
 */
function resolveCategory(
  input: string,
  categories: CategoryFlat[],
  reqTypeCode?: string
): CategoryFlat | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const pool = reqTypeCode
    ? categories.filter((c) => c.reqTypeCode === reqTypeCode)
    : categories;

  const pickUnique = (matches: CategoryFlat[]): CategoryFlat | null => {
    if (matches.length === 1) return matches[0]!;
    return null;
  };

  // 1. Exact full path
  const exactPath = pickUnique(pool.filter((c) => c.path === trimmed));
  if (exactPath) return exactPath;

  const normalized = trimmed.replace(/\s*\/\s*/g, "/");

  // 2. Exact path after normalize
  const exactNorm = pickUnique(pool.filter((c) => c.path === normalized));
  if (exactNorm) return exactNorm;

  if (normalized.includes("/")) {
    const parts = normalized.split("/");
    const withoutRoot = parts.slice(1).join("/");
    if (withoutRoot) {
      const bySuffix = pickUnique(pool.filter((c) => c.path === withoutRoot));
      if (bySuffix) return bySuffix;
    }
    const byEndsWith = pool.filter(
      (c) => c.path === normalized || c.path.endsWith("/" + normalized)
    );
    const uniqueEnds = pickUnique(byEndsWith);
    if (uniqueEnds) return uniqueEnds;
  } else {
    const byName = pool.filter((c) => c.name === normalized);
    const uniqueName = pickUnique(byName);
    if (uniqueName) return uniqueName;
  }

  return null;
}

/**
 * Parse a raw Excel row into a typed data object.
 */
function parseRow(
  raw: RawRow,
  errors: string[]
): Partial<CreateRequirementInput> & { categoryName?: string; reqTypeInput?: string; reqTypeLabel?: string } {
  const data: Partial<CreateRequirementInput> & { categoryName?: string; reqTypeInput?: string; reqTypeLabel?: string } = {};

  // Required
  data.categoryName = safeStr(raw["分类"]);
  data.reqTypeInput = safeStr(raw["需求类型"]);
  const reqNoRaw = safeStr(raw["需求编码"]);
  data.reqNo = reqNoRaw || undefined;
  data.title = safeStr(raw["标题"]);
  data.priority = (safeStr(raw["优先级"]) || undefined) as CreateRequirementInput["priority"];
  data.status = safeStr(raw["状态"]) || undefined;

  // Optional
  data.module = safeStr(raw["模块"]) || undefined;
  data.assignee = safeStr(raw["负责人"]) || undefined;

  const dateStr = safeStr(raw["期望日期"]);
  if (dateStr) {
    // Excel may return a Date object or string
    const d = raw["期望日期"];
    const normalized = parseDateInput(d);
    if (normalized) {
      data.targetDate = normalized;
    } else {
      errors.push(`期望日期"${dateStr}"格式无效，应为 YYYY-MM-DD`);
    }
  }

  const tagsStr = safeStr(raw["标签"]);
  if (tagsStr) {
    data.tags = tagsStr.split(/[,，;；]/).map((t) => t.trim()).filter(Boolean);
  }

  data.background = safeStr(raw["需求背景"]) || undefined;
  data.description = safeStr(raw["需求描述"]) || undefined;
  data.designSolution = safeStr(raw["设计方案"]) || undefined;
  data.gspImpact = safeStr(raw["GSP影响"]) || undefined;
  data.relatedTables = safeStr(raw["相关表"]) || undefined;

  return data;
}

function safeStr(val: unknown): string {
  if (val == null) return "";
  const s = String(val).trim();
  return s === "" ? "" : s;
}

/**
 * Parse a date value from Excel into a YYYY-MM-DD string.
 * Supports: Date object, Excel serial number, "YYYY-MM-DD" / "YYYY/MM/DD" / "YYYY.MM.DD" strings.
 * Returns null when the value is empty or unparseable.
 */
function parseDateInput(d: unknown): string | null {
  if (d == null || d === "") return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof d === "number") {
    // Excel serial date — convert
    const code = XLSX.SSF.parse_date_code(d);
    if (!code) return null;
    return `${code.y}-${String(code.m).padStart(2, "0")}-${String(code.d).padStart(2, "0")}`;
  }
  // String: accept YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const s = String(d).trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const dy = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || dy < 1 || dy > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(dy).padStart(2, "0")}`;
}

/**
 * Resolve user-entered requirement type to a code.
 * Accepts either the canonical code (e.g. "REQUIREMENT") or the display name
 * (e.g. "需求"). Returns null when not recognized.
 */
function resolveReqType(
  input: string,
  typeRows: { code: string; displayName: string }[]
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Exact code match (case-insensitive)
  const lower = trimmed.toLowerCase();
  const byCode = typeRows.find((t) => t.code.toLowerCase() === lower);
  if (byCode) return byCode.code;

  // 2. Exact displayName match
  const byDisplay = typeRows.find((t) => t.displayName === trimmed);
  if (byDisplay) return byDisplay.code;

  return null;
}
