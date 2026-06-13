import type { RequirementQuery } from '../../api/requirements';

const FILTER_KEYS: (keyof RequirementQuery)[] = [
  'search',
  'reqType',
  'categoryId',
  'priority',
  'status',
  'assignee',
  'module',
  'groupName',
];

/** 从 URL 解析列表筛选（不含分页） */
export function parseRequirementQueryFromSearchParams(
  sp: URLSearchParams
): Partial<RequirementQuery> {
  const out: Partial<RequirementQuery> = {};

  const search = sp.get('search');
  if (search) out.search = search;

  const reqType = sp.get('reqType');
  if (reqType) out.reqType = reqType as RequirementQuery['reqType'];

  const categoryId = sp.get('categoryId');
  if (categoryId) {
    const n = parseInt(categoryId, 10);
    if (!Number.isNaN(n)) out.categoryId = n;
  }

  const priority = sp.get('priority');
  if (priority) out.priority = priority as RequirementQuery['priority'];

  const status = sp.get('status');
  if (status) out.status = status;

  const assignee = sp.get('assignee');
  if (assignee) out.assignee = assignee;

  const moduleName = sp.get('module');
  if (moduleName) out.module = moduleName;

  const groupName = sp.get('groupName');
  if (groupName) out.groupName = groupName;

  return out;
}

/** 将筛选写入 URL（仅包含有值的字段） */
export function requirementQueryToSearchParams(
  filters: RequirementQuery
): URLSearchParams {
  const sp = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = filters[key];
    if (v === undefined || v === null || v === '') continue;
    sp.set(key, String(v));
  }
  return sp;
}

/** 视图/接口 JSON 中 categoryId 可能是字符串 */
export function normalizeRequirementQuery(
  raw: RequirementQuery
): RequirementQuery {
  const f = { ...raw };
  if (f.categoryId != null && typeof f.categoryId !== 'number') {
    const n = parseInt(String(f.categoryId), 10);
    f.categoryId = Number.isNaN(n) ? undefined : n;
  }
  return f;
}
