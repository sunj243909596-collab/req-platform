/** 从检索片段提取可引用的表名，用于约束 LLM 禁止臆造 */

const TABLE_PATTERNS = [
  // WMOS 真实表名：全大写下划线（ASN, ASN_DETAIL, TC_LPN_ID, BATCH_NBR 等）
  /\b([A-Z][A-Z0-9]*(?:_[A-Z][A-Z0-9]*)+)\b/g,
  // 反引号中任何含下划线的标识符（如 Markdown 文档中的 `ASN_DETAIL`）
  /`([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+)`/g,
  // 遗留项目前缀（wm_/WM_/app_/spl_/C_）
  /\b(wm|app|spl|C)_[a-z][a-z0-9_]*\b/gi,
  /\bWM_[A-Z][A-Z0-9_]*\b/g,
];

function nameFromFileName(fileName: string): string | null {
  const base = fileName.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
  if (/^(wm_|WM_|app_|spl_)/i.test(base)) return base;
  return null;
}

export function extractGroundedTableNames(
  chunks: { content: string; fileName: string }[]
): string[] {
  const names = new Set<string>();

  for (const chunk of chunks) {
    const fromFile = nameFromFileName(chunk.fileName);
    if (fromFile) names.add(fromFile);

    for (const pattern of TABLE_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(chunk.content)) !== null) {
        const raw = m[1] ?? m[0];
        const t = raw.trim();
        if (t.length >= 4 && (t.includes("_") || /^WM_/i.test(t))) {
          names.add(t);
        }
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

/** 注入 Prompt 的表名白名单块 */
export function buildTableGroundingBlock(tableNames: string[]): string {
  if (tableNames.length === 0) {
    return `## 表名引用约束（必须遵守）

本次检索片段中未提取到数据库表名。回答中涉及的**每一个表名**必须：
1. 在下方「相关知识库内容」正文中存在（含反引号 \`表名\` 形式）
2. 如果片段正文也没有该表名，必须写：**「当前检索信息未覆盖该表名，无法确认」**

**严禁**自行编造表名。WMOS 不使用 wm_ 前缀（例如 \`wm_asn_header\` 不存在，正确表名是 \`ASN\`、\`ASN_DETAIL\` 等）。不确定的表名宁可不说，不要猜。
`;
  }

  const list = tableNames.map((n) => `- \`${n}\``).join("\n");
  return `## 表名引用约束（必须遵守）

下列表名已从**本次检索片段**中提取。回答里出现的**每一个数据库表名**必须满足其一：
1. 与下列某一项**完全一致**（含大小写）；或
2. 在下方「相关知识库内容」正文中可找到相同写法。

**禁止**使用下列列表和片段正文中均未出现的表名（例如 \`inv_inventory\`、\`inventory\` 等臆测名）。

### 允许引用的表名
${list}

若用户询问的表不在上述列表且片段正文也无该名，必须明确说明：**「当前检索片段未提及该表名」**，不要猜测。
`;
}
