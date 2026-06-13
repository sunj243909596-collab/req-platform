import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, FolderTree, Loader2 } from 'lucide-react';
import type { RequirementCategoryNode } from '../../api/categories';

type Props = {
  tree: RequirementCategoryNode[];
  selectedCategoryId?: number;
  loading?: boolean;
  /** Filtered total count from the current list results (overrides tree sum when set) */
  filteredTotal?: number;
  /** Category-level filtered counts: { categoryId: count } */
  categoryCounts?: Record<number, number>;
  onSelectAll: () => void;
  onSelectCategory: (categoryId: number) => void;
};

/**
 * Compute recursive total for a node given a flat map of categoryId → count.
 * A parent's count = its own direct count + sum of all children's recursive counts.
 */
function computeRecursiveTotal(
  node: RequirementCategoryNode,
  countsMap: Record<number, number>
): number {
  let total = countsMap[node.id] ?? 0;
  for (const child of node.children) {
    total += computeRecursiveTotal(child, countsMap);
  }
  return total;
}

function CategoryTreeNode({
  node,
  depth,
  selectedCategoryId,
  categoryCounts,
  onSelectCategory,
}: {
  node: RequirementCategoryNode;
  depth: number;
  selectedCategoryId?: number;
  categoryCounts?: Record<number, number>;
  onSelectCategory: (categoryId: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(depth < 1);
  const isSelected = selectedCategoryId === node.id;
  const disabled = !node.enabled;

  const hasFilteredCounts = categoryCounts && Object.keys(categoryCounts).length > 0;
  const displayCount = hasFilteredCounts
    ? computeRecursiveTotal(node, categoryCounts!)
    : (node.totalCount ?? node.count ?? 0);

  return (
    <div>
      <div
        className="flex items-center gap-0.5"
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <button
          type="button"
          className="p-1 shrink-0 text-[var(--ink-muted-48)] hover:text-[var(--ink-muted-80)]"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((o) => !o);
          }}
          aria-label={open ? '收起' : '展开'}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            open ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelectCategory(node.id)}
          className={`
            flex-1 min-w-0 text-left py-2 px-2 rounded-[var(--radius-md)] text-sm transition-colors flex items-center justify-between gap-2
            ${isSelected
              ? 'bg-[var(--primary)]/12 text-[var(--primary)] font-medium'
              : 'text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'}
            ${disabled ? 'opacity-45 cursor-not-allowed' : ''}
            ${node.isRoot ? 'font-semibold' : ''}
          `}
          title={disabled ? '分类已停用' : undefined}
        >
          <span className="truncate">{node.name}</span>
          <span className={`text-xs shrink-0 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--ink-muted-48)]'}`}>
            {displayCount}
          </span>
        </button>
      </div>
      {open &&
        node.children.map((child: RequirementCategoryNode) => (
          <CategoryTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedCategoryId={selectedCategoryId}
            categoryCounts={categoryCounts}
            onSelectCategory={onSelectCategory}
          />
        ))}
    </div>
  );
}

export function RequirementCategorySidebar({
  tree,
  selectedCategoryId,
  loading,
  filteredTotal,
  categoryCounts,
  onSelectAll,
  onSelectCategory,
}: Props) {
  const allSelected = selectedCategoryId == null;

  const filteredAllTotal = useMemo(() => {
    if (!categoryCounts || Object.keys(categoryCounts).length === 0) return null;
    return tree.reduce((sum, root) => sum + computeRecursiveTotal(root, categoryCounts), 0);
  }, [tree, categoryCounts]);

  const allTotal = filteredAllTotal ?? filteredTotal ?? tree.reduce((sum, root) => sum + (root.totalCount ?? root.count ?? 0), 0);

  return (
    <aside className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--hairline)]">
        <FolderTree size={18} className="text-[var(--primary)] shrink-0" />
        <span className="text-sm font-semibold text-[var(--ink)]">分类目录</span>
      </div>

      <div className={`flex-1 overflow-y-auto p-2 max-h-[min(70vh,640px)] lg:max-h-[calc(100vh-220px)]`}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onSelectAll}
              className={`
                w-full text-left py-2.5 px-3 mb-1 rounded-[var(--radius-md)] text-sm transition-colors flex items-center justify-between
                ${allSelected
                  ? 'bg-[var(--primary)]/12 text-[var(--primary)] font-medium'
                  : 'text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'}
              `}
            >
              <span>全部需求</span>
              <span className={`text-xs ${allSelected ? 'text-[var(--primary)]' : 'text-[var(--ink-muted-48)]'}`}>
                {allTotal}
              </span>
            </button>
            <div className="border-t border-[var(--hairline)] pt-2 mt-1">
              {tree.map((root) => (
                <CategoryTreeNode
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedCategoryId={selectedCategoryId}
                  categoryCounts={categoryCounts}
                  onSelectCategory={onSelectCategory}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
