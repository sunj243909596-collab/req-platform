import { useEffect, useMemo, useState } from 'react';
import {
  listRequirementCategories,
  flattenCategoryTree,
  type RequirementCategoryNode,
} from '../../api/categories';

type Props = {
  value: number | '';
  /** 按需求类型过滤，仅展示该类型根下的分类 */
  reqType?: string;
  /** 是否排除类型根节点（创建需求时不可选根） */
  excludeRoot?: boolean;
  /** 第三个参数（可选）：选中的完整节点，方便父组件读 code 等字段 */
  onChange: (categoryId: number, reqType: string, fullNode?: RequirementCategoryNode) => void;
  disabled?: boolean;
  className?: string;
};

function filterTreeByReqType(
  nodes: RequirementCategoryNode[],
  reqType?: string
): RequirementCategoryNode[] {
  if (!reqType) return nodes;
  return nodes
    .filter((n) => n.reqType === reqType)
    .map((n) => ({
      ...n,
      children: filterTreeByReqType(n.children, reqType),
    }));
}

export function CategoryTreeSelect({
  value,
  reqType,
  excludeRoot = false,
  onChange,
  disabled,
  className = '',
}: Props) {
  const [tree, setTree] = useState<RequirementCategoryNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRequirementCategories()
      .then(setTree)
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredTree = useMemo(() => filterTreeByReqType(tree, reqType), [tree, reqType]);

  const options = useMemo(() => {
    const flat = flattenCategoryTree(filteredTree).filter((o) => o.enabled);
    return excludeRoot ? flat.filter((o) => !o.isRoot) : flat;
  }, [filteredTree, excludeRoot]);

  return (
    <select
      value={value === '' ? '' : String(value)}
      disabled={disabled || loading}
      onChange={(e) => {
        const id = parseInt(e.target.value, 10);
        const opt = options.find((o) => o.id === id);
        if (opt) onChange(id, opt.reqType, opt);
      }}
      className={`w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ${className}`}
    >
      <option value="">{loading ? '加载分类...' : '请选择分类'}</option>
      {options.map((o) => (
        <option key={o.id} value={String(o.id)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
