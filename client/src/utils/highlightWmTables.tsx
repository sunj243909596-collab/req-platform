import type { ReactNode } from 'react';

/** 高亮预览文本中的 WMOS 表名（wm_* / WM_* / app_* / spl_*） */
const TABLE_SPLIT_RE = /(\bwm_[a-z][a-z0-9_]*\b|\bWM_[A-Z][A-Z0-9_]*\b|\b(?:app|spl)_[a-z][a-z0-9_]*\b|`[a-z][a-z0-9_]+`)/gi;
const TABLE_MATCH_RE = /^(\bwm_[a-z][a-z0-9_]*\b|\bWM_[A-Z][A-Z0-9_]*\b|\b(?:app|spl)_[a-z][a-z0-9_]*\b|`[a-z][a-z0-9_]+`)$/i;

export function highlightWmTables(text: string): ReactNode[] {
  const parts = text.split(TABLE_SPLIT_RE);
  return parts.map((part, i) => {
    if (!part) return null;
    if (TABLE_MATCH_RE.test(part)) {
      return (
        <mark
          key={i}
          className="bg-[var(--primary)]/15 text-[var(--primary)] font-medium px-0.5 rounded"
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
