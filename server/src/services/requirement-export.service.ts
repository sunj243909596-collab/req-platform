import XLSX from "xlsx";

/** All exportable fields with their Chinese labels */
export interface ExportFieldDef {
  key: string;
  label: string;
}

export const ALL_EXPORT_FIELDS: ExportFieldDef[] = [
  { key: "reqNo", label: "需求编码" },
  { key: "title", label: "标题" },
  { key: "categoryPath", label: "分类" },
  { key: "reqType", label: "需求类型" },
  { key: "priority", label: "优先级" },
  { key: "status", label: "状态" },
  { key: "module", label: "模块" },
  { key: "assignee", label: "负责人" },
  { key: "groupName", label: "所属组" },
  { key: "targetDate", label: "期望日期" },
  { key: "tags", label: "标签" },
  { key: "background", label: "需求背景" },
  { key: "description", label: "需求描述" },
  { key: "designSolution", label: "设计方案" },
  { key: "gspImpact", label: "GSP影响" },
  { key: "relatedTables", label: "相关表" },
  { key: "createdAt", label: "创建时间" },
  { key: "updatedAt", label: "更新时间" },
];

/**
 * Generate an Excel buffer from requirement data with selected fields.
 */
export function generateExportExcel(
  fields: string[],
  rows: Record<string, unknown>[]
): Buffer {
  // Build field definitions from requested keys
  const fieldDefs = ALL_EXPORT_FIELDS.filter((f) => fields.includes(f.key));
  if (fieldDefs.length === 0) {
    throw new Error("没有选择任何导出字段");
  }

  const headers = fieldDefs.map((f) => f.label);

  // Build data rows
  const data = rows.map((row) => {
    return fieldDefs.map((f) => {
      let val = row[f.key];
      if (val == null) return "";
      if (Array.isArray(val)) return val.join(", ");
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}T/)) {
        return val.slice(0, 10);
      }
      return String(val);
    });
  });

  const sheetData = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Set column widths based on header length
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length * 2.5, 12) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "需求导出");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
