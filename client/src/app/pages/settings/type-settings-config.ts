/** 设置侧栏：各需求类型的分类 / 编码独立菜单 */
export const TYPE_SETTINGS_MENU = [
  { code: 'REQUIREMENT', label: '需求' },
  { code: 'BUG', label: '缺陷' },
  { code: 'PERFORMANCE', label: '改进' },
  { code: 'SAFETY', label: '任务' },
  { code: 'UX', label: '体验' },
] as const;

export type TypeSettingsCode = (typeof TYPE_SETTINGS_MENU)[number]['code'];

export function parseSettingsTab(tab: string): { kind: 'categories' | 'numberRule'; reqType: string } | null {
  const [kind, reqType] = tab.split(':');
  if ((kind === 'categories' || kind === 'numberRule') && reqType) {
    return { kind, reqType };
  }
  return null;
}
