import { http } from './http';
import type {
  RequirementCategoryNode,
  CreateRequirementCategoryInput,
  UpdateRequirementCategoryInput,
} from 'shared-types';

export type { RequirementCategoryNode };

export async function listRequirementCategories(): Promise<RequirementCategoryNode[]> {
  return http.get('/requirements/categories');
}

export async function createRequirementCategory(
  input: CreateRequirementCategoryInput
): Promise<{ id: number; name: string }> {
  return http.post('/requirements/categories', input);
}

export async function updateRequirementCategory(
  id: number,
  input: UpdateRequirementCategoryInput
): Promise<{ id: number; name: string }> {
  return http.put(`/requirements/categories/${id}`, input);
}

export async function deleteRequirementCategory(id: number): Promise<void> {
  await http.delete(`/requirements/categories/${id}`);
}

/** 扁平化树，用于下拉。返回展开后的节点（保留所有原字段 + depth 标签） */
export function flattenCategoryTree(
  nodes: RequirementCategoryNode[],
  depth = 0
): Array<RequirementCategoryNode & { label: string }> {
  const out: Array<RequirementCategoryNode & { label: string }> = [];
  for (const n of nodes) {
    const prefix = depth > 0 ? `${'—'.repeat(depth)} ` : '';
    out.push({
      ...n,
      label: `${prefix}${n.name}`,
    });
    if (n.children.length) out.push(...flattenCategoryTree(n.children, depth + 1));
  }
  return out;
}

export function findCategoryPath(
  nodes: RequirementCategoryNode[],
  targetId: number,
  trail: string[] = []
): string | null {
  for (const n of nodes) {
    const path = [...trail, n.name];
    if (n.id === targetId) return path.join(' / ');
    if (n.children.length) {
      const found = findCategoryPath(n.children, targetId, path);
      if (found) return found;
    }
  }
  return null;
}
