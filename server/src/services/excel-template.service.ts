import XLSX from "xlsx";

const TEMPLATE_HEADERS = [
  "分类",
  "需求类型",
  "需求编码",
  "标题",
  "优先级",
  "状态",
  "模块",
  "负责人",
  "期望日期",
  "标签",
  "需求背景",
  "需求描述",
  "设计方案",
  "GSP影响",
  "相关表",
];

const EXAMPLE_ROW = [
  "PC端/出库管理",
  "需求",
  "REQ-2026-101",
  "支持波次合并拣货",
  "P1",
  "待评审",
  "出库管理",
  "张三",
  "2026-06-15",
  "出库,波次",
  "当前拣货效率较低，希望支持波次合并",
  "将多个订单合并为一个波次，一次性拣货",
  "在出库管理页面新增波次合并按钮",
  "待评估",
  "WAVE,ORDER",
];

/**
 * Generate an Excel (.xlsx) template buffer for requirement import.
 */
export function generateImportTemplate(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, EXAMPLE_ROW]);

  // Set column widths
  ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "需求导入模板");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
