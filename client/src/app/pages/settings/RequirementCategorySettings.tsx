import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router';
import {
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  FolderTree,
  List,
  FilePlus,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listRequirementCategories,
  createRequirementCategory,
  updateRequirementCategory,
  deleteRequirementCategory,
  type RequirementCategoryNode,
} from '../../../api/categories';
import { authStore } from '../../../stores/auth';

/** 与后端 requirement-category.service 一致 */
const CATEGORY_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{0,30}$/;

/** 查找目标节点的所有祖先 id（不含自身），用于保存后保持展开 */
function findAncestorIds(
  nodes: RequirementCategoryNode[],
  targetId: number,
  trail: number[] = []
): number[] | null {
  for (const n of nodes) {
    if (n.id === targetId) return trail;
    const found = findAncestorIds(n.children, targetId, [...trail, n.id]);
    if (found) return found;
  }
  return null;
}

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

function getCodeMeta(depth: number, isRoot: boolean) {
  if (isRoot) {
    return {
      label: '类型根节点',
      placeholder: '不参与编码',
      hint: '需求/缺陷/改进/任务根节点不出现在编号中，无需设置 code',
      optional: true,
    };
  }
  if (depth === 1) {
    return {
      label: '一级模块 code（编码第 2 段）',
      placeholder: '如 RM（入库管理）',
      hint: '对应 HD-RM-… 中的 RM',
      optional: false,
    };
  }
  return {
    label: '二级模块 code（编码第 3 段）',
    placeholder: '如 1001（收货）',
    hint: '对应 HD-RM-1001-… 中的 1001；上级一级模块也须设 code',
    optional: false,
  };
}

function CategoryEditPanel({
  node,
  depth,
  onCancel,
  onSaved,
}: {
  node: RequirementCategoryNode;
  depth: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code ?? '');
  const [saving, setSaving] = useState(false);
  const codeMeta = getCodeMeta(depth, node.isRoot);
  const normalizedCode = code.trim().toUpperCase();
  const codeValid = normalizedCode === '' || CATEGORY_CODE_RE.test(normalizedCode);

  const save = async () => {
    if (!name.trim()) {
      toast.error('分类名称不能为空');
      return;
    }
    if (!codeValid) {
      toast.error('编码格式无效');
      return;
    }
    setSaving(true);
    try {
      await updateRequirementCategory(node.id, {
        name: name.trim(),
        code: normalizedCode,
      });
      toast.success('已保存');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 p-3 border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas-parchment)] space-y-3">
      <div>
        <label className="block text-[11px] text-[var(--ink-muted-80)] mb-1">分类名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)]"
        />
      </div>
      {!node.isRoot && (
        <div>
          <label className="block text-[11px] text-[var(--ink-muted-80)] mb-1">{codeMeta.label}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={codeMeta.placeholder}
            maxLength={31}
            className="w-full px-3 py-2 text-sm font-mono border border-[var(--hairline)] rounded-[var(--radius-md)]"
          />
          <p className="text-[10px] text-[var(--ink-muted-80)] mt-1">
            {codeValid ? codeMeta.hint : '格式错误：大写字母/数字开头，1-31 字符'}
          </p>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !codeValid}
          className="px-3 py-1.5 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] disabled:opacity-40"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}

function CategoryRow({
  node,
  depth,
  isAdmin,
  expandedIds,
  onToggleExpand,
  onEnsureExpanded,
  onRefresh,
  siblings,
}: {
  node: RequirementCategoryNode;
  depth: number;
  isAdmin: boolean;
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onEnsureExpanded: (id: number) => void;
  onRefresh: () => void;
  siblings: RequirementCategoryNode[];
}) {
  const isOpen = expandedIds.has(node.id);
  /** 仅二级及以下按编码自动排序；类型根与一级模块可手动上下移 */
  const allowManualReorder = node.isRoot || depth === 1;
  const siblingIndex = siblings.findIndex((s) => s.id === node.id);
  const canMoveUp = allowManualReorder && siblingIndex > 0;
  const canMoveDown = allowManualReorder && siblingIndex >= 0 && siblingIndex < siblings.length - 1;
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [childCode, setChildCode] = useState('');

  const hasChildren = node.children.length > 0;
  const childCodeNorm = childCode.trim().toUpperCase();
  const childCodeValid = childCodeNorm === '' || CATEGORY_CODE_RE.test(childCodeNorm);

  const addChild = async () => {
    if (!childName.trim()) {
      toast.error('请输入子分类名称');
      return;
    }
    if (!childCodeValid) {
      toast.error('子分类编码格式无效');
      return;
    }
    try {
      await createRequirementCategory({
        parentId: node.id,
        name: childName.trim(),
        code: childCodeNorm || undefined,
      });
      toast.success('子分类已添加');
      setChildName('');
      setChildCode('');
      setAddingChild(false);
      onEnsureExpanded(node.id);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const remove = async () => {
    if (!confirm(`确定删除分类「${node.name}」？`)) return;
    try {
      await deleteRequirementCategory(node.id);
      toast.success('已删除');
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const toggleEnabled = async () => {
    if (node.isRoot) return;
    try {
      await updateRequirementCategory(node.id, { enabled: !node.enabled });
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const moveSibling = async (direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? siblingIndex - 1 : siblingIndex + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) return;
    const other = siblings[swapIndex];
    try {
      await Promise.all([
        updateRequirementCategory(node.id, { sortOrder: other.sortOrder }),
        updateRequirementCategory(other.id, { sortOrder: node.sortOrder }),
      ]);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '排序失败');
    }
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] ${
          !node.enabled ? 'opacity-50' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          className="p-1 text-[var(--ink-muted-80)]"
          onClick={() => onToggleExpand(node.id)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${node.isRoot ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink)]'}`}>
              {node.name}
              {node.isRoot && (
                <span className="ml-2 text-xs font-normal text-[var(--ink-muted-80)]">（根类型，不可删）</span>
              )}
            </span>
            {!node.isRoot && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] border ${
                  node.code
                    ? 'border-[var(--primary)]/30 bg-[var(--primary)]/5 text-[var(--primary)]'
                    : 'border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--ink-muted-80)]'
                }`}
                title={depth === 1 ? '一级模块 code（编码第 2 段）' : '二级模块 code（编码第 3 段）'}
              >
                {depth === 1 ? '一级' : '二级'}:{node.code || '未设置'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Link
            to={`/app/requirements?categoryId=${node.id}`}
            className="p-1.5 text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-[var(--radius-sm)]"
            title="查看该分类下的需求"
          >
            <List size={14} />
          </Link>
          <Link
            to={`/app/requirements/new?categoryId=${node.id}`}
            className="p-1.5 text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-[var(--radius-sm)]"
            title="在此分类下创建需求"
          >
            <FilePlus size={14} />
          </Link>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  onEnsureExpanded(node.id);
                  setEditing((v) => !v);
                }}
                className="p-1.5 text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-[var(--radius-sm)]"
                title="编辑名称与编码"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => moveSibling('up')}
                className="p-1.5 text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-sm)] disabled:opacity-30"
                title="上移"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => moveSibling('down')}
                className="p-1.5 text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-sm)] disabled:opacity-30"
                title="下移"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => setAddingChild(true)}
                className="p-1.5 text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-[var(--radius-sm)]"
                title="添加子分类"
              >
                <Plus size={14} />
              </button>
              {!node.isRoot && (
                <>
                  <button
                    type="button"
                    onClick={toggleEnabled}
                    className="px-2 py-0.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-sm)]"
                  >
                    {node.enabled ? '停用' : '启用'}
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    className="p-1.5 text-[var(--destructive)] hover:bg-red-50 rounded-[var(--radius-sm)]"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {editing && isAdmin && (
        <div style={{ paddingLeft: `${depth * 16 + 32}px`, paddingRight: '8px' }}>
          <CategoryEditPanel
            node={node}
            depth={depth}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onEnsureExpanded(node.id);
              onRefresh();
            }}
          />
        </div>
      )}

      {addingChild && isAdmin && (
        <div
          className="py-2 space-y-2"
          style={{ paddingLeft: `${(depth + 1) * 16 + 32}px`, paddingRight: '8px' }}
        >
          <input
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="子分类名称"
            className="w-full max-w-sm px-3 py-1.5 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)]"
            autoFocus
          />
          <input
            value={childCode}
            onChange={(e) => setChildCode(e.target.value.toUpperCase())}
            placeholder={depth === 0 ? '一级模块 code（如 RM）' : '二级模块 code（如 1001）'}
            maxLength={31}
            className="w-full max-w-sm px-3 py-1.5 text-sm font-mono border border-[var(--hairline)] rounded-[var(--radius-md)]"
          />
          {!childCodeValid && (
            <p className="text-[10px] text-[var(--destructive)]">编码格式无效</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addChild}
              disabled={!childCodeValid}
              className="px-3 py-1.5 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] disabled:opacity-40"
            >
              添加
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingChild(false);
                setChildName('');
                setChildCode('');
              }}
              className="px-3 py-1.5 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {isOpen &&
        node.children.map((child) => (
          <CategoryRow
            key={child.id}
            node={child}
            depth={depth + 1}
            isAdmin={isAdmin}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onEnsureExpanded={onEnsureExpanded}
            onRefresh={onRefresh}
            siblings={node.children}
          />
        ))}
    </div>
  );
}

type RequirementCategorySettingsProps = {
  reqType: string;
  title: string;
};

export function RequirementCategorySettings({ reqType, title }: RequirementCategorySettingsProps) {
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const [tree, setTree] = useState<RequirementCategoryNode[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const activeRoot = tree.find((r) => r.reqType === reqType);

  const refresh = useCallback(async () => {
    const isFirst = tree.length === 0;
    if (isFirst) setInitialLoading(true);
    else setRefreshing(true);
    try {
      const data = await listRequirementCategories();
      setTree(data);
      const root = data.find((r) => r.reqType === reqType);
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        if (!root) return prev;
        return new Set([root.id, ...root.children.map((c) => c.id)]);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [tree.length, reqType]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const ensureExpanded = useCallback(
    (id: number) => {
      const ancestors = findAncestorIds(tree, id) ?? [];
      setExpandedIds((prev) => new Set([...prev, ...ancestors, id]));
    },
    [tree]
  );

  useEffect(() => {
    setExpandedIds(new Set());
    void refresh();
  }, [reqType]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <FolderTree size={20} className="text-[var(--primary)]" />
        <div>
          <h3 className="text-lg font-semibold text-[var(--ink)]">{title}</h3>
          <p className="text-sm text-[var(--ink-muted-80)]">
            仅维护「{title.replace(/分类$/, '')}」类型下的业务模块与 code；类型根不参与编码。编号第 2、3 段来自此处配置。
            一级模块可手动排序；<strong>二级按编码自动排序</strong>（如 1001、1002）。各类型分类相互独立，需分别配置。
          </p>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-sm text-[var(--ink-muted-80)] mb-4 p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
          仅管理员可维护分类；您可在创建需求时选择已有分类。
        </p>
      )}

      {initialLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[var(--primary)]" size={28} />
        </div>
      ) : !activeRoot ? (
        <p className="text-sm text-[var(--ink-muted-80)] py-8 text-center">未找到该类型的分类根节点</p>
      ) : (
        <div className="border border-[var(--hairline)] rounded-[var(--radius-lg)] overflow-hidden bg-[var(--canvas)] relative">
          {refreshing && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 text-[11px] text-[var(--ink-muted-80)] bg-[var(--canvas)]/90 px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--hairline)]">
              <Loader2 size={12} className="animate-spin" />
              更新中
            </div>
          )}
          <CategoryRow
            key={activeRoot.id}
            node={activeRoot}
            depth={0}
            isAdmin={!!isAdmin}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            onEnsureExpanded={ensureExpanded}
            onRefresh={() => void refresh()}
            siblings={[activeRoot]}
          />
        </div>
      )}
    </div>
  );
}
