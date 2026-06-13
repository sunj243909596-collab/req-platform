/** 所有已知的 KB docType 字符串(对应 KnowledgeBase.docType / KnowledgeDocument.docType) */
export const KB_DOC_TYPES = {
  PRODUCT_DOC: "PRODUCT_DOC",
  MANUAL: "MANUAL",
  CHUNK_DATA: "CHUNK_DATA",
  REQUIREMENT_LIST: "REQUIREMENT_LIST",
} as const;

export type KbDocType = (typeof KB_DOC_TYPES)[keyof typeof KB_DOC_TYPES];

/** admin UI 下拉选项的展示文案 */
export const KB_DOC_TYPE_LABELS: Record<KbDocType, string> = {
  PRODUCT_DOC: "产品文档(PRD/BRD/FSD)",
  MANUAL: "操作手册",
  CHUNK_DATA: "巴枪端分块",
  REQUIREMENT_LIST: "需求列表与发版计划",
};

/** 所有合法 docType 列表(给 UI 下拉用) */
export const KB_DOC_TYPE_OPTIONS: { value: KbDocType; label: string }[] = (
  Object.keys(KB_DOC_TYPES) as KbDocType[]
).map((k) => ({ value: k, label: KB_DOC_TYPE_LABELS[k] }));
