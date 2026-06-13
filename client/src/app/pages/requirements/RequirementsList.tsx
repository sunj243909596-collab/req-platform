import { Link, useSearchParams } from 'react-router';
import { Plus, Search, Loader2, Save, X, Sheet, Trash2, Upload, Columns2, ChevronDown, FileDown, FileUp, SlidersHorizontal, GripVertical } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { AppPageShell } from '../../components/AppPageShell';
import { PageHeader } from '../../components/PageHeader';
import { SurfaceCard } from '../../components/SurfaceCard';
import { EmptyState } from '../../components/EmptyState';
import { RequirementCategorySidebar } from '../../components/RequirementCategorySidebar';
import { RequirementImportDialog } from '../../components/RequirementImportDialog';
import { RequirementExportDialog } from '../../components/RequirementExportDialog';
import { StatusChangeDialog } from '../../components/StatusChangeDialog';
import {
  listRequirements, getCategoryCounts, getModuleOptions, getDistinctStatuses, listViews,
  createView, deleteView, deleteRequirement, batchDeleteRequirements,
  type RequirementListItem, type RequirementQuery, type RequirementView,
  type CustomFieldValue, type Priority, type ReqType,
} from '../../../api/requirements';
import { listCustomFields, listWorkflows, type CustomField } from '../../../api/settings';
import {
  listRequirementCategories,
  findCategoryPath,
  type RequirementCategoryNode,
} from '../../../api/categories';
import {
  normalizeRequirementQuery,
  parseRequirementQueryFromSearchParams,
  requirementQueryToSearchParams,
} from '../../utils/requirement-query-url';
import { listRequirementTypes } from '../../../api/req-types';
import type { RequirementTypeItem } from 'shared-types';

// ── Display constants ──────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, string> = {
  P0: 'P0 (紧急)', P1: 'P1 (高)', P2: 'P2 (中)', P3: 'P3 (低)',
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  P0: { bg: '#fef2f2', color: '#dc2626' },
  P1: { bg: '#fff7ed', color: '#ea580c' },
  P2: { bg: '#eff6ff', color: '#2563eb' },
  P3: { bg: '#f0fdf4', color: '#16a34a' },
};

const REQ_TYPE_FALLBACK = { label: '', bg: '#f3f4f6', color: '#6b7280' };

// 状态色:从后端注入的 req.statusColor 读取(对应 group workflow 的 WorkflowStatus.color)
// 没配才掉到 #6c757d
function pickStatusColor(reqStatusColor: string | null | undefined, statusName: string): string {
  if (reqStatusColor) return reqStatusColor;
  return '#6c757d';
}

// ── Resize handle component ────────────────────────────────────────

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onMouseDown(e); }}
      style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 8, cursor: 'col-resize', zIndex: 1,
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      }}
      onMouseEnter={e => { const bar = e.currentTarget.querySelector('.rh-bar') as HTMLElement; if (bar) bar.style.backgroundColor = 'var(--primary)'; }}
      onMouseLeave={e => { const bar = e.currentTarget.querySelector('.rh-bar') as HTMLElement; if (bar) bar.style.backgroundColor = 'var(--hairline)'; }}
    >
      <div className="rh-bar" style={{ width: 2, margin: '4px 0', borderRadius: 2, backgroundColor: 'var(--hairline)', transition: 'background-color 0.15s' }} />
    </div>
  );
}

// ── Filter defaults ────────────────────────────────────────────────

const EMPTY_FILTERS: RequirementQuery = {
  search: '',
  reqType: undefined,
  categoryId: undefined,
  priority: undefined,
  status: undefined,
  assignee: '',
  module: '',
};

// ── Column config ──────────────────────────────────────────────────

type ColumnKey = 'reqNo' | 'title' | 'categoryPath' | 'reqType' | 'priority' | 'status' | 'assignee' | 'module' | 'releaseVersion' | 'updatedAt';
const COLUMN_DEFS: { key: ColumnKey; label: string; defaultVisible: boolean; sortField?: string }[] = [
  { key: 'reqNo',          label: '需求编码', defaultVisible: true,  sortField: 'reqNo' },
  { key: 'categoryPath',   label: '分类',     defaultVisible: true },
  { key: 'reqType',        label: '需求类型', defaultVisible: true,  sortField: 'reqType' },
  { key: 'title',          label: '标题',     defaultVisible: true,  sortField: 'title' },
  { key: 'priority',       label: '优先级',   defaultVisible: true,  sortField: 'priority' },
  { key: 'status',         label: '状态',     defaultVisible: true,  sortField: 'status' },
  { key: 'assignee',       label: '负责人',   defaultVisible: true,  sortField: 'assignee' },
  { key: 'module',         label: '模块',     defaultVisible: false, sortField: 'module' },
  { key: 'releaseVersion', label: '发版',     defaultVisible: false, sortField: 'releaseVersion' },
  { key: 'updatedAt',      label: '更新时间', defaultVisible: false, sortField: 'updatedAt' },
];

// ── Column default widths (px) ─────────────────────────────────────
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  reqNo: 110, categoryPath: 130, reqType: 90, title: 300,
  priority: 100, status: 90, assignee: 80, module: 90,
  releaseVersion: 80, updatedAt: 90,
};

// ── System filter definitions ─────────────────────────────────────
const SYSTEM_FILTER_DEFS = [
  { key: 'search',   label: '搜索' },
  { key: 'status',   label: '状态' },
  { key: 'assignee', label: '负责人' },
  { key: 'module',   label: '模块' },
  { key: 'priority', label: '优先级' },
  { key: 'reqType',  label: '需求类型' },
] as const;

// ─ Component ──────────────────────────────────────────────────────

export function RequirementsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requirements, setRequirements] = useState<RequirementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const pageSize = 20;

  const [categoryTree, setCategoryTree] = useState<RequirementCategoryNode[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryCounts, setCategoryCounts] = useState<Record<number, number>>({});
  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [endStatusNames, setEndStatusNames] = useState<Set<string>>(new Set());
  const [reqTypes, setReqTypes] = useState<RequirementTypeItem[]>([]);

  const [filters, setFilters] = useState<RequirementQuery>(() => ({
    ...EMPTY_FILTERS,
    ...parseRequirementQueryFromSearchParams(searchParams),
  }));

  const [views, setViews] = useState<RequirementView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null);
  const [showSaveView, setShowSaveView] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  // Status change dialog
  const [statusChangeTarget, setStatusChangeTarget] = useState<RequirementListItem | null>(null);

  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    try {
      const saved = localStorage.getItem('req-list-columns-v2');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(COLUMN_DEFS.filter(c => c.defaultVisible).map(c => c.key));
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem('req-list-columns-v2', JSON.stringify([...next]));
      return next;
    });
  };

  // Custom field column visibility (null = show all; set = explicit user choice)
  const [cfColumnsOverride, setCfColumnsOverride] = useState<Set<number> | null>(() => {
    try {
      const saved = localStorage.getItem('req-list-cf-columns');
      if (saved) return new Set<number>(JSON.parse(saved));
    } catch {}
    return null;
  });

  const visibleCfIds = useMemo(
    () => cfColumnsOverride ?? new Set(customFields.map(f => f.id)),
    [cfColumnsOverride, customFields]
  );

  const toggleCfColumn = (id: number) => {
    setCfColumnsOverride(prev => {
      const base = prev ?? new Set(customFields.map(f => f.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('req-list-cf-columns', JSON.stringify([...next]));
      return next;
    });
  };

  // Column resize widths — persisted
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('req-list-col-widths');
      if (saved) return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULT_COL_WIDTHS };
  });
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  const startResize = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    resizingRef.current = { key, startX: e.clientX, startW: colWidths[key] ?? DEFAULT_COL_WIDTHS[key] ?? 100 };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key: k, startX, startW } = resizingRef.current;
      const w = Math.max(50, startW + ev.clientX - startX);
      setColWidths(prev => {
        const next = { ...prev, [k]: w };
        localStorage.setItem('req-list-col-widths', JSON.stringify(next));
        return next;
      });
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Column order (drag-to-reorder) — persisted
  const [colOrder, setColOrder] = useState<ColumnKey[]>(() => {
    try {
      const saved = localStorage.getItem('req-list-col-order');
      if (saved) return JSON.parse(saved) as ColumnKey[];
    } catch {}
    return COLUMN_DEFS.map(c => c.key);
  });
  const dragColRef = useRef<ColumnKey | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnKey | null>(null);

  const onColDragStart = (key: ColumnKey) => { dragColRef.current = key; };
  const onColDragOver = (e: React.DragEvent, key: ColumnKey) => {
    e.preventDefault();
    if (dragColRef.current && dragColRef.current !== key) setDragOverCol(key);
  };
  const onColDrop = (targetKey: ColumnKey) => {
    const from = dragColRef.current;
    if (!from || from === targetKey) { dragColRef.current = null; setDragOverCol(null); return; }
    setColOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(targetKey);
      if (fi < 0 || ti < 0) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      localStorage.setItem('req-list-col-order', JSON.stringify(next));
      return next;
    });
    dragColRef.current = null;
    setDragOverCol(null);
  };
  const onColDragEnd = () => { dragColRef.current = null; setDragOverCol(null); };

  // Sort state
  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (field: string) => {
    if (sortBy === field) {
      const next = sortDir === 'asc' ? 'desc' : 'asc';
      setSortDir(next);
      fetchWithFilters({ ...filters, sortBy: field, sortOrder: next } as typeof filters, page, false);
    } else {
      setSortBy(field);
      setSortDir('asc');
      fetchWithFilters({ ...filters, sortBy: field, sortOrder: 'asc' } as typeof filters, page, false);
    }
  };

  // Configurable filter conditions
  const [visibleFilters, setVisibleFilters] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('req-list-filters');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(['search', 'status', 'assignee', 'module', 'priority', 'reqType']);
  });

  const toggleFilter = (key: string) => {
    setVisibleFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem('req-list-filters', JSON.stringify([...next]));
      return next;
    });
  };

  const [showFilterConfig, setShowFilterConfig] = useState(false);

  const columnMenuRef = useRef<HTMLDivElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) setShowColumnMenu(false);
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) setShowMoreActions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    listViews().then(setViews).catch(() => {});
    setCategoriesLoading(true);
    listRequirementCategories()
      .then(setCategoryTree)
      .catch(() => setCategoryTree([]))
      .finally(() => setCategoriesLoading(false));
    getModuleOptions().then(setModuleOptions).catch(() => {});
    listCustomFields().then(setCustomFields).catch(() => setCustomFields([]));
    listRequirementTypes().then(setReqTypes).catch(() => setReqTypes([]));
    Promise.all([
      listWorkflows().catch(() => []),
      getDistinctStatuses().catch(() => []),
    ]).then(([wfs, dbStatuses]) => {
      const wfStatuses = (wfs as typeof wfs)
        .filter(w => w.enabled)
        .flatMap(w => w.statuses.map(s => s.name));
      // DB-actual statuses first so current data is always findable, then workflow statuses
      const merged = [...new Set([...dbStatuses, ...wfStatuses])];
      setStatusOptions(merged);
      // 收集 end-state 名,用于整行灰底渲染
      const ends = new Set<string>();
      wfs.filter(w => w.enabled).forEach(w => w.statuses.forEach(s => { if (s.isEnd) ends.add(s.name); }));
      setEndStatusNames(ends);
    });
  }, []);

  const syncFiltersToUrl = useCallback((next: RequirementQuery) => {
    const sp = requirementQueryToSearchParams(next);
    setSearchParams(sp, { replace: true });
  }, [setSearchParams]);

  const fetchWithFilters = useCallback((
    next: RequirementQuery,
    p = 1,
    syncUrl = true
  ) => {
    const query: RequirementQuery = { page: p, pageSize, ...next };
    // preserve current sort if not overridden
    if (!query.sortBy && sortBy) { query.sortBy = sortBy; query.sortOrder = sortDir; }
    if (syncUrl) syncFiltersToUrl(next);
    setLoading(true);
    setError(null);

    const countsFilters = { ...next, categoryId: undefined };
    Promise.all([
      listRequirements(query),
      getCategoryCounts(countsFilters),
    ])
      .then(([result, countsResult]) => {
        setRequirements(result.data);
        setTotal(result.total);
        setPage(p);
        const countsMap: Record<number, number> = {};
        for (const c of countsResult.categoryCounts) countsMap[c.categoryId] = c.count;
        setCategoryCounts(countsMap);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [pageSize, syncFiltersToUrl]);

  const applyFilters = useCallback((
    overrides?: Partial<RequirementQuery>,
    p = 1,
    opts?: { syncUrl?: boolean }
  ) => {
    const merged = { ...filters, ...overrides };
    setFilters(merged);
    fetchWithFilters(merged, p, opts?.syncUrl !== false);
  }, [filters, fetchWithFilters]);

  useEffect(() => {
    const fromUrl = parseRequirementQueryFromSearchParams(searchParams);
    const merged = { ...EMPTY_FILTERS, ...fromUrl };
    setFilters(merged);
    fetchWithFilters(merged, 1, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilter = <K extends keyof RequirementQuery>(key: K, value: RequirementQuery[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => applyFilters(undefined, 1);

  const handleSelectCategory = (categoryId: number) => {
    applyFilters({ categoryId }, 1);
  };

  const handleSelectAllCategories = () => {
    applyFilters({ categoryId: undefined }, 1);
  };

  const selectedCategoryLabel = useMemo(() => {
    if (filters.categoryId == null) return null;
    return findCategoryPath(categoryTree, filters.categoryId);
  }, [categoryTree, filters.categoryId]);

  const handleSelectView = (viewId: number) => {
    const v = views.find(x => x.id === viewId);
    if (!v) return;
    setSelectedViewId(viewId);
    const normalized = normalizeRequirementQuery(v.filters);
    setFilters(normalized);
    fetchWithFilters(normalized, 1);
  };

  const handleClearView = () => {
    setSelectedViewId(null);
    setFilters(EMPTY_FILTERS);
    setSearchParams(new URLSearchParams(), { replace: true });
    fetchWithFilters(EMPTY_FILTERS, 1, false);
  };

  const handleViewChange = (value: string) => {
    if (!value) { handleClearView(); return; }
    handleSelectView(parseInt(value, 10));
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) { toast.error('请输入视图名称'); return; }
    try {
      const v = await createView({ name: newViewName.trim(), filters });
      setViews(prev => [...prev, v]);
      setSelectedViewId(v.id);
      setNewViewName('');
      setShowSaveView(false);
      toast.success('视图已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleDeleteRequirement = async (reqId: number, reqNo: string, title: string) => {
    if (!window.confirm(`确定要删除需求 ${reqNo}「${title}」吗？\n此操作将同时删除所有关联数据（子任务、评论、文档、附件等），且不可恢复。`)) return;
    try {
      await deleteRequirement(reqId);
      toast.success('需求已删除');
      fetchWithFilters(filters, page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 清掉已不在当前页的选中（避免删了一页后还残留）
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(requirements.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [requirements]);

  const allSelected = requirements.length > 0 && requirements.every((r) => selectedIds.has(r.id));
  const someSelected = requirements.some((r) => selectedIds.has(r.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allSelected) return new Set();
      return new Set(requirements.map((r) => r.id));
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`确定要删除选中的 ${ids.length} 条需求吗？\n此操作将同时删除所有关联数据（子任务、评论、文档、附件等），且不可恢复。`)) return;
    setBatchDeleting(true);
    try {
      await batchDeleteRequirements(ids);
      toast.success(`已删除 ${ids.length} 条需求`);
      clearSelection();
      fetchWithFilters(filters, page);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '批量删除失败');
    } finally {
      setBatchDeleting(false);
    }
  };

  const clearAuxFilters = () => {
    const next = { ...filters, ...EMPTY_FILTERS, categoryId: filters.categoryId };
    setFilters(next);
    fetchWithFilters(next, 1);
    fetchWithFilters(next, 1);
  };

  const activeFilterCount = [filters.reqType, filters.categoryId, filters.priority, filters.status, filters.assignee, filters.module].filter(Boolean).length;
  const auxFilterCount = [filters.reqType, filters.priority, filters.status, filters.assignee, filters.module].filter(Boolean).length;

  return (
    <AppPageShell maxWidth="full">
      <PageHeader title="需求管理" description="管理所有需求、缺陷和任务" />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3 items-start">
        {/* ── Left sidebar ──────────────────────────────────────── */}
        <SurfaceCard padding="none" className="lg:sticky lg:top-0 overflow-hidden">
          <RequirementCategorySidebar
            tree={categoryTree}
            selectedCategoryId={filters.categoryId}
            loading={categoriesLoading}
            filteredTotal={Object.keys(categoryCounts).length > 0 ? undefined : total}
            categoryCounts={categoryCounts}
            onSelectAll={handleSelectAllCategories}
            onSelectCategory={handleSelectCategory}
          />
        </SurfaceCard>

        {/* ── Right content ────────────────────────────────────── */}
        <div className="min-w-0 space-y-1.5">
          {/* ── Toolbar: view + filters + actions (single row) ── */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* View selector */}
            {views.length > 0 ? (
              <select
                value={selectedViewId ?? ''}
                onChange={(e) => handleViewChange(e.target.value)}
                className="px-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)] text-[var(--ink-muted-80)]"
              >
                <option value="">全部视图</option>
                {views.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
              </select>
            ) : null}

            {/* divider + count */}
            <span className="text-[11px] text-[var(--ink-muted-48)]">共 <strong className="text-[var(--ink)]">{total}</strong> 个</span>

            <div className="h-4 border-l border-[var(--hairline)]" />

            {/* ── Filters ────────────────────────────────────────── */}
            {visibleFilters.has('search') && (
              <div className="relative flex-1 min-w-[160px] max-w-[280px]">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
                <input
                  type="text"
                  placeholder="搜索编号或标题..."
                  value={filters.search || ''}
                  onChange={(e) => setFilter('search', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-full pl-7 pr-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>
            )}

            {visibleFilters.has('status') && (
              <select value={filters.status || ''} onChange={(e) => setFilter('status', e.target.value || undefined)}
                className="px-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">状态</option>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {visibleFilters.has('assignee') && (
              <input type="text" placeholder="负责人" value={filters.assignee || ''}
                onChange={(e) => setFilter('assignee', e.target.value || undefined)}
                className="px-2 py-1.5 w-16 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]" />
            )}

            {visibleFilters.has('module') && moduleOptions.length > 0 && (
              <select value={filters.module || ''} onChange={(e) => setFilter('module', e.target.value || undefined)}
                className="px-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">模块</option>
                {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            {visibleFilters.has('priority') && (
              <select value={filters.priority || ''} onChange={(e) => setFilter('priority', (e.target.value || undefined) as 'P0' | 'P1' | 'P2' | 'P3' | undefined)}
                className="px-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">优先级</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            )}

            {visibleFilters.has('reqType') && (
              <select value={filters.reqType || ''} onChange={(e) => setFilter('reqType', (e.target.value || undefined) as ReqType)}
                className="px-2 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]">
                <option value="">类型</option>
                {reqTypes.map((t) => (
                  <option key={t.code} value={t.code}>{t.displayName}</option>
                ))}
              </select>
            )}

            <button onClick={handleSearch} className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-xs hover:bg-[var(--primary-focus)] transition-colors whitespace-nowrap">
              <Search size={12} /> 查询
            </button>

            {/* More actions dropdown */}
            <div className="relative" ref={moreActionsRef}>
              <button onClick={() => setShowMoreActions(!showMoreActions)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink-muted-80)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors">
                <Sheet size={12} /> <ChevronDown size={10} />
              </button>
              {showMoreActions && (
                <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] shadow-lg py-1">
                  <button onClick={() => { setShowFilterConfig(true); setShowMoreActions(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-parchment)] transition-colors">
                    <SlidersHorizontal size={14} /> 配置查询条件
                  </button>
                  <div className="border-t border-[var(--hairline)] my-1" />
                  <button onClick={() => { setShowImportDialog(true); setShowMoreActions(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-parchment)] transition-colors">
                    <FileUp size={14} /> Excel 导入
                  </button>
                  <button onClick={() => { setShowExportDialog(true); setShowMoreActions(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--canvas-parchment)] transition-colors">
                    <FileDown size={14} /> Excel 导出
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1" />

            {/* ── Action group (right side of toolbar) ── */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ink-muted-80)]">已选 {selectedIds.size} 条</span>
                <button onClick={clearSelection} className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--ink)] transition-colors">
                  取消
                </button>
                <button onClick={handleBatchDelete} disabled={batchDeleting}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--destructive)] text-white rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-50">
                  {batchDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  批量删除
                </button>
              </div>
            )}
            {auxFilterCount > 0 && (
              <button onClick={clearAuxFilters} className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--destructive)] transition-colors">
                <X size={12} /> 清除
              </button>
            )}
            <button onClick={() => { setShowSaveView(true); setNewViewName(''); }}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors">
              <Save size={12} /> 存视图
            </button>
            <div className="relative" ref={columnMenuRef}>
              <button onClick={() => setShowColumnMenu(!showColumnMenu)}
                className="flex items-center gap-1 px-2 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink-muted-80)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors">
                <Columns2 size={12} /> 列
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] shadow-lg py-1 max-h-80 overflow-y-auto">
                  <p className="px-3 pt-2 pb-1 text-[11px] text-[var(--ink-muted-48)] font-medium uppercase tracking-wide">系统字段（可拖拽排序）</p>
                  {(() => {
                    const colDefMap = new Map(COLUMN_DEFS.map(c => [c.key, c]));
                    const orderedCols = [
                      ...colOrder.map(k => colDefMap.get(k)).filter(Boolean) as typeof COLUMN_DEFS,
                      ...COLUMN_DEFS.filter(c => !colOrder.includes(c.key)),
                    ];
                    return orderedCols.map(col => (
                      <div key={col.key}
                        draggable
                        onDragStart={() => onColDragStart(col.key)}
                        onDragOver={(e) => onColDragOver(e, col.key)}
                        onDrop={() => onColDrop(col.key)}
                        onDragEnd={onColDragEnd}
                        className={`flex items-center gap-1 px-2 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--canvas-parchment)] transition-colors cursor-grab active:cursor-grabbing select-none ${dragOverCol === col.key ? 'border-t-2 border-[var(--primary)]' : ''}`}>
                        <GripVertical size={12} className="shrink-0 text-[var(--ink-muted-48)]" />
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input type="checkbox" checked={visibleColumns.has(col.key)} onChange={() => toggleColumn(col.key)}
                            className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                          <span className="text-xs">{col.label}</span>
                        </label>
                      </div>
                    ));
                  })()}
                  {customFields.length > 0 && (
                    <>
                      <div className="border-t border-[var(--hairline)] my-1" />
                      <p className="px-3 pt-1 pb-1 text-[11px] text-[var(--ink-muted-48)] font-medium uppercase tracking-wide">自定义字段</p>
                      {customFields.map(field => (
                        <label key={field.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--canvas-parchment)] cursor-pointer transition-colors">
                          <input type="checkbox" checked={visibleCfIds.has(field.id)} onChange={() => toggleCfColumn(field.id)}
                            className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                          <span className="text-xs">{field.fieldName}</span>
                        </label>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Create button */}
            <Link
              to={filters.categoryId ? `/app/requirements/new?categoryId=${filters.categoryId}` : '/app/requirements/new'}
              className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-xs hover:bg-[var(--primary-focus)] transition-colors whitespace-nowrap">
              <Plus size={12} /> 创建需求
            </Link>
          </div>

          {/* ── Loading / Error / Empty ─────────────────────────── */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
            </div>
          )}
          {error && (
            <div className="text-center py-12">
              <p className="text-[var(--destructive)] mb-4">{error}</p>
              <button onClick={() => fetchWithFilters(filters, page, false)}
                className="px-4 py-2 text-sm text-[var(--primary)] hover:underline">重试</button>
            </div>
          )}
          {!loading && !error && requirements.length === 0 && (
            <EmptyState
              title={activeFilterCount > 0 ? '未找到匹配的需求' : '暂无需求'}
              actionLabel="创建第一个需求"
              actionTo={filters.categoryId ? `/app/requirements/new?categoryId=${filters.categoryId}` : '/app/requirements/new'}
            />
          )}

          {/* ── Table ───────────────────────────────────────────── */}
          {!loading && !error && requirements.length > 0 && (() => {
            // respect drag-reordered column order, then filter visibility
            const colDefMap = new Map(COLUMN_DEFS.map(c => [c.key, c]));
            const orderedKeys = [
              ...colOrder.filter(k => visibleColumns.has(k)),
              ...COLUMN_DEFS.filter(c => visibleColumns.has(c.key) && !colOrder.includes(c.key)).map(c => c.key),
            ];
            const visCols = orderedKeys.map(k => colDefMap.get(k)!).filter(Boolean);
            const visCfs  = customFields.filter(f => visibleCfIds.has(f.id));
            const totalW  = visCols.reduce((s, c) => s + (colWidths[c.key] ?? DEFAULT_COL_WIDTHS[c.key] ?? 100), 0)
                          + visCfs.reduce((s, f) => s + (colWidths[`cf_${f.id}`] ?? 120), 0)
                          + 64;
            return (
            <SurfaceCard padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse" style={{ tableLayout: 'fixed', width: totalW }}>
                  <thead>
                    <tr className="border-b border-[var(--hairline)] bg-[var(--canvas-parchment)]">
                      <th className="px-2.5 py-2 text-center" style={{ width: 32 }}>
                        <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }} onChange={toggleSelectAll}
                          className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                          title={allSelected ? '取消全选' : '全选当前页'} />
                      </th>
                      {visCols.map(col => {
                        const w = colWidths[col.key] ?? DEFAULT_COL_WIDTHS[col.key] ?? 100;
                        const isSort = sortBy === col.sortField;
                        const isDragOver = dragOverCol === col.key;
                        return (
                          <th key={col.key}
                              className="relative text-left text-sm font-medium select-none"
                              style={{ width: w, maxWidth: w, borderLeft: isDragOver ? '2px solid var(--primary)' : undefined }}
                              draggable
                              onDragStart={() => onColDragStart(col.key)}
                              onDragOver={(e) => onColDragOver(e, col.key)}
                              onDrop={() => onColDrop(col.key)}
                              onDragEnd={onColDragEnd}
                          >
                            <div
                              className={`px-2.5 py-2 overflow-hidden whitespace-nowrap flex items-center gap-1 cursor-grab active:cursor-grabbing ${col.sortField ? 'hover:text-[var(--ink)] cursor-pointer' : ''} text-[var(--ink-muted-80)]`}
                              onClick={() => col.sortField && toggleSort(col.sortField)}
                            >
                              <span className="truncate">{col.label}</span>
                              {col.sortField && (
                                <span className={`shrink-0 text-[10px] leading-none transition-opacity ${isSort ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                                  {isSort ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                </span>
                              )}
                            </div>
                            <ResizeHandle onMouseDown={(e) => startResize(e, col.key)} />
                          </th>
                        );
                      })}
                      {visCfs.map(field => {
                        const w = colWidths[`cf_${field.id}`] ?? 120;
                        return (
                          <th key={field.id} className="relative text-left text-sm font-medium select-none"
                              style={{ width: w, maxWidth: w }}>
                            <div className="px-2.5 py-2 overflow-hidden whitespace-nowrap text-ellipsis text-[var(--ink-muted-80)] cursor-grab active:cursor-grabbing">
                              {field.fieldName}{field.required ? ' *' : ''}
                            </div>
                            <ResizeHandle onMouseDown={(e) => startResize(e, `cf_${field.id}`)} />
                          </th>
                        );
                      })}
                      <th className="px-2.5 py-2 text-center text-sm font-medium text-[var(--ink-muted-80)]" style={{ width: 64 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--hairline)]">
                    {requirements.map((req) => {
                      const t = reqTypes.find(x => x.code === req.reqType);
                      const typeTag = t
                        ? { label: t.displayName, bg: t.color + '22', color: t.color }
                        : { ...REQ_TYPE_FALLBACK, label: req.reqType };
                      const typePrefix = t
                        ? { label: t.prefix || t.code.slice(0, 3), bg: t.color + '22', color: t.color }
                        : { ...REQ_TYPE_FALLBACK, label: req.reqType.slice(0, 3) };
                      const pStyle = PRIORITY_STYLES[req.priority] ?? { bg: '#f3f4f6', color: '#6b7280' };
                      const cvMap = new Map<number, string>();
                      req.customValues?.forEach(cv => cvMap.set(cv.fieldId, cv.value));

                      return (
                        <tr key={req.id} className={`hover:bg-[var(--canvas-parchment)] transition-colors ${selectedIds.has(req.id) ? 'bg-[var(--primary)]/5' : ''} ${endStatusNames.has(req.status) ? 'opacity-50' : ''}`}>
                          <td className="px-2.5 py-1.5 text-center" style={{ width: 32 }}>
                            <input type="checkbox" checked={selectedIds.has(req.id)} onChange={() => toggleSelect(req.id)}
                              className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                              onClick={(e) => e.stopPropagation()} />
                          </td>
                          {visCols.map(col => {
                            const tdCls = "px-2.5 py-1.5 overflow-hidden whitespace-nowrap";
                            switch (col.key) {
                              case 'reqNo': return (
                                <td key="reqNo" className={tdCls}>
                                  <Link to={`/app/requirements/${req.id}`} className="text-[var(--primary)] hover:underline font-mono text-sm">{req.reqNo}</Link>
                                </td>
                              );
                              case 'categoryPath': return (
                                <td key="categoryPath" className={tdCls} title={req.categoryPath || undefined}>
                                  <span className="text-xs text-[var(--ink-muted-80)]">{req.categoryPath || '-'}</span>
                                </td>
                              );
                              case 'reqType': return (
                                <td key="reqType" className={tdCls}>
                                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: typeTag.bg, color: typeTag.color }}>{typeTag.label}</span>
                                </td>
                              );
                              case 'title': return (
                                <td key="title" className={tdCls}>
                                  <Link to={`/app/requirements/${req.id}`} className="flex items-center gap-1.5 text-sm text-[var(--ink)] hover:text-[var(--primary)] transition-colors w-full min-w-0">
                                    <span className="inline-flex shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium" style={{ backgroundColor: typePrefix.bg, color: typePrefix.color }}>{typePrefix.label}</span>
                                    <span className="truncate flex-1 min-w-0">{req.title}</span>
                                  </Link>
                                </td>
                              );
                              case 'priority': return (
                                <td key="priority" className={tdCls}>
                                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: pStyle.bg, color: pStyle.color }}>{PRIORITY_LABELS[req.priority] ?? req.priority}</span>
                                </td>
                              );
                              case 'status': return (
                                <td key="status" className={tdCls}>
                                  <button onClick={(e) => { e.stopPropagation(); setStatusChangeTarget(req); }}
                                    className="inline-block px-2.5 py-0.5 rounded-[1px] text-xs font-medium text-white cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[var(--primary)] transition-all"
                                    style={{ backgroundColor: pickStatusColor(req.statusColor, req.status) }}>{req.status}</button>
                                </td>
                              );
                              case 'assignee': return <td key="assignee" className={tdCls}><span className="text-sm text-[var(--ink)]">{req.assignee || '-'}</span></td>;
                              case 'module': return <td key="module" className={tdCls}><span className="text-sm text-[var(--ink-muted-80)]">{req.module || '-'}</span></td>;
                              case 'releaseVersion': return <td key="releaseVersion" className={tdCls}><span className="text-sm text-[var(--ink-muted-80)]">{req.releaseVersion || '-'}</span></td>;
                              case 'updatedAt': return <td key="updatedAt" className={tdCls}><span className="text-xs text-[var(--ink-muted-80)]">{req.updatedAt?.slice(0, 10)}</span></td>;
                              default: return null;
                            }
                          })}
                          {visCfs.map(field => {
                            const val = cvMap.get(field.id);
                            return (
                              <td key={field.id} className="px-2.5 py-1.5 overflow-hidden whitespace-nowrap">
                                <span className="text-sm text-[var(--ink-muted-80)]">{val || '-'}</span>
                              </td>
                            );
                          })}
                          <td className="px-2.5 py-1.5">
                            <div className="flex items-center justify-center gap-1">
                              <Link to={`/app/requirements/${req.id}/edit`}
                                className="p-1.5 text-[var(--ink-muted-48)] hover:text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                                title="编辑" onClick={(e) => e.stopPropagation()}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="M15 5l4 4"/></svg>
                              </Link>
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteRequirement(req.id, req.reqNo, req.title); }}
                                className="p-1.5 text-[var(--ink-muted-48)] hover:text-[var(--destructive)] hover:bg-red-50 rounded transition-colors"
                                title="删除"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination ──────────────────────────────────── */}
              {total > pageSize && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--hairline)] bg-[var(--canvas-parchment)]">
                  <span className="text-xs text-[var(--ink-muted-80)]">共 {total} 条</span>
                  <div className="flex items-center gap-1">
                    <button disabled={page <= 1} onClick={() => fetchWithFilters(filters, page - 1, false)}
                      className="px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-sm)] hover:bg-[var(--canvas)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一页</button>
                    <span className="px-2 text-xs text-[var(--ink-muted-80)]">{page} / {Math.ceil(total / pageSize)}</span>
                    <button disabled={page * pageSize >= total} onClick={() => fetchWithFilters(filters, page + 1, false)}
                      className="px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-sm)] hover:bg-[var(--canvas)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一页</button>
                  </div>
                </div>
              )}
            </SurfaceCard>
            );
          })()}
        </div>
      </div>

      {/* ── Save view modal ─────────────────────────────────────── */}
      {showSaveView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-[var(--ink)]">保存为我的视图</h3>
            <input type="text" value={newViewName} onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
              placeholder="视图名称，例如：我的P0缺陷"
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] mb-4"
              autoFocus />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSaveView(false)} className="px-4 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
              <button onClick={handleSaveView} className="px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">保存</button>
            </div>
          </div>
        </div>
      )}

      <RequirementImportDialog open={showImportDialog} onClose={() => setShowImportDialog(false)} onImported={() => fetchWithFilters(filters, 1)} />
      <RequirementExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} currentFilters={filters as unknown as Record<string, unknown>} totalCount={total} />

      {/* ── Filter config modal ─────────────────────────────────── */}
      {showFilterConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[var(--ink)]">配置查询条件</h3>
              <button onClick={() => setShowFilterConfig(false)} className="text-[var(--ink-muted-48)] hover:text-[var(--ink)] transition-colors"><X size={16} /></button>
            </div>

            <p className="text-[11px] text-[var(--ink-muted-48)] font-medium uppercase tracking-wide mb-2">系统字段</p>
            <div className="space-y-1 mb-4">
              {SYSTEM_FILTER_DEFS.map(def => (
                <label key={def.key} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[var(--canvas-parchment)] cursor-pointer transition-colors">
                  <input type="checkbox" checked={visibleFilters.has(def.key)} onChange={() => toggleFilter(def.key)}
                    className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                  <span className="text-sm text-[var(--ink)]">{def.label}</span>
                </label>
              ))}
            </div>

            {customFields.length > 0 && (
              <>
                <div className="border-t border-[var(--hairline)] my-3" />
                <p className="text-[11px] text-[var(--ink-muted-48)] font-medium uppercase tracking-wide mb-2">自定义字段</p>
                <div className="space-y-1">
                  {customFields.map(field => (
                    <label key={field.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-[var(--canvas-parchment)] cursor-pointer transition-colors">
                      <input type="checkbox" checked={visibleFilters.has(`cf_${field.id}`)} onChange={() => toggleFilter(`cf_${field.id}`)}
                        className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                      <span className="text-sm text-[var(--ink)]">{field.fieldName}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="flex justify-end mt-5">
              <button onClick={() => setShowFilterConfig(false)} className="px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">完成</button>
            </div>
          </div>
        </div>
      )}

      {statusChangeTarget && (
        <StatusChangeDialog
          open={true}
          onClose={() => setStatusChangeTarget(null)}
          reqId={statusChangeTarget.id}
          currentStatus={statusChangeTarget.status}
          currentStatusColor={statusChangeTarget.statusColor ?? null}
          currentAssignee={statusChangeTarget.assignee || ''}
          groupName={statusChangeTarget.groupName}
          reqTitle={statusChangeTarget.title}
          onTransitioned={() => { setStatusChangeTarget(null); fetchWithFilters(filters, page); }}
        />
      )}
    </AppPageShell>
  );
}
