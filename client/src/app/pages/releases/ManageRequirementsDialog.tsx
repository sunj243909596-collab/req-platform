import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  getUnassignedRequirements,
  addRequirementsToRelease,
  getDistinctAssignees,
  type UnassignedRequirementsQuery,
} from '../../../api/releases';
import {
  getDistinctStatuses,
  getModuleOptions,
  type RequirementListItem,
  type Priority,
  type ReqType,
} from '../../../api/requirements';
import { listRequirementTypes } from '../../../api/req-types';
import type { RequirementTypeItem } from 'shared-types';

const PRIORITY_OPTIONS: Priority[] = ['P0', 'P1', 'P2', 'P3'];

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#ff3b30', P1: '#ff9500', P2: '#0066cc', P3: '#34c759',
};

interface Props {
  releaseId: number;
  groupName: string | undefined;
  versionNo: string;
  open: boolean;
  onClose: () => void;
  onAdded: (count: number) => void;
}

const PAGE_SIZE = 20;

export function ManageRequirementsDialog({ releaseId, groupName, versionNo, open, onClose, onAdded }: Props) {
  const [filters, setFilters] = useState<UnassignedRequirementsQuery>({
    releaseId,
    groupName,
    search: '',
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [data, setData] = useState<RequirementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // 下拉选项
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>([]);
  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [reqTypes, setReqTypes] = useState<RequirementTypeItem[]>([]);

  // 防抖搜索
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchInput, setSearchInput] = useState('');

  // 卸载时清理未触发的搜索 timer
  useEffect(() => () => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
  }, []);

  // 打开/关闭重置
  useEffect(() => {
    if (open) {
      setFilters({ releaseId, groupName, search: '', page: 1, pageSize: PAGE_SIZE });
      setSearchInput('');
      setSelectedIds(new Set());
      setError(null);
    }
  }, [open, releaseId, groupName]);

  // 拉下拉选项
  useEffect(() => {
    if (!open) return;
    Promise.all([
      getDistinctStatuses(),
      getDistinctAssignees(groupName),
      getModuleOptions(),
      listRequirementTypes(),
    ]).then(([s, a, m, t]) => {
      setStatusOptions(s);
      setAssigneeOptions(a);
      setModuleOptions(m);
      setReqTypes(t);
    }).catch(() => toast.error('加载筛选选项失败'));
  }, [open, groupName]);

  // 拉数据
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getUnassignedRequirements(filters)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setTotal(res.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, open]);

  // 搜索防抖
  function handleSearchChange(v: string) {
    setSearchInput(v);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: v, page: 1 }));
    }, 300);
  }

  function handleFilterChange<K extends keyof UnassignedRequirementsQuery>(key: K, value: UnassignedRequirementsQuery[K]) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }

  function handleReset() {
    setSearchInput('');
    setFilters({ releaseId, groupName, search: '', page: 1, pageSize: PAGE_SIZE });
  }

  const pageIds = useMemo(() => data.map((r) => r.id), [data]);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePageAll() {
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleAdd() {
    if (selectedIds.size === 0) { toast.error('请选择需求'); return; }
    setSubmitting(true);
    try {
      await addRequirementsToRelease(releaseId, Array.from(selectedIds));
      onAdded(selectedIds.size);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedIdPreview = useMemo(() => {
    const sample = data.filter((r) => selectedIds.has(r.id)).slice(0, 5).map((r) => r.reqNo);
    if (sample.length === 0) return '';
    const more = selectedIds.size > sample.length ? ` ... 等 ${selectedIds.size} 个` : '';
    return sample.join(', ') + more;
  }, [data, selectedIds]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
          <h3 className="text-[var(--ink)]">管理需求 · {versionNo}</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--canvas-parchment)] rounded">
            <X size={20} className="text-[var(--ink-muted-80)]" />
          </button>
        </div>
        {/* Filter row */}
        <div className="px-6 py-3 border-b border-[var(--hairline)] space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-80)]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜索编码或标题..."
                className="w-full pl-9 pr-4 py-2 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
              />
              {searchInput && (
                <button onClick={() => handleSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--ink-muted-80)] hover:text-[var(--ink)]">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={handleReset} className="flex items-center gap-1 px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">
              <RotateCcw size={14} /> 重置
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="状态" value={filters.status} options={statusOptions} onChange={(v) => handleFilterChange('status', v)} />
            <FilterSelect label="优先级" value={filters.priority} options={PRIORITY_OPTIONS} onChange={(v) => handleFilterChange('priority', v as Priority | undefined)} />
            <FilterSelect label="负责人" value={filters.assignee} options={assigneeOptions} onChange={(v) => handleFilterChange('assignee', v)} />
            <FilterSelect label="类型" value={filters.reqType} options={reqTypes.map((t) => ({ value: t.code, label: t.displayName }))} onChange={(v) => handleFilterChange('reqType', v as ReqType | undefined)} />
            <FilterSelect label="模块" value={filters.module} options={moduleOptions} onChange={(v) => handleFilterChange('module', v)} />
          </div>
        </div>
        {/* Table area */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {error ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm">
              <p className="text-[var(--destructive)] mb-3">{error}</p>
              <button onClick={() => setFilters((f) => ({ ...f }))} className="px-4 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] text-sm">
                点击重试
              </button>
            </div>
          ) : loading && data.length === 0 ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] animate-pulse" />)}</div>
          ) : data.length === 0 ? (
            <p className="text-center py-12 text-sm text-[var(--ink-muted-80)]">
              {hasActiveFilter(filters) ? '无匹配结果' : '没有可关联的需求'}
            </p>
          ) : (
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <thead className="bg-[var(--canvas-parchment)] sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-10 text-left">
                    <input
                      type="checkbox"
                      checked={pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))}
                      ref={(el) => { if (el) el.indeterminate = !pageIds.every((id) => selectedIds.has(id)) && pageIds.some((id) => selectedIds.has(id)); }}
                      onChange={togglePageAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">编码</th>
                  <th className="px-3 py-2 text-left font-semibold" style={{ width: '40%' }}>标题</th>
                  <th className="px-3 py-2 text-left font-semibold w-20">优先级</th>
                  <th className="px-3 py-2 text-left font-semibold w-24">状态</th>
                  <th className="px-3 py-2 text-left font-semibold w-24">负责人</th>
                  <th className="px-3 py-2 text-left font-semibold w-20">类型</th>
                </tr>
              </thead>
              <tbody>
                {data.map((req) => {
                  const isSelected = selectedIds.has(req.id);
                  return (
                    <tr
                      key={req.id}
                      onClick={() => toggleSelect(req.id)}
                      className={`border-b border-[var(--hairline)] cursor-pointer transition-colors ${isSelected ? 'bg-[var(--primary)]/5' : 'hover:bg-[var(--canvas-parchment)]'}`}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(req.id)} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--ink-muted-80)]">{req.reqNo}</td>
                      <td className="px-3 py-2 text-[var(--ink)] truncate max-w-0" title={req.title}>{req.title}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded-[1px] text-xs font-semibold text-white" style={{ backgroundColor: PRIORITY_COLORS[req.priority] || '#6c757d' }}>
                          {req.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded-[1px] text-xs font-semibold text-white" style={{ backgroundColor: req.statusColor || '#6c757d' }}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--ink)]">{req.assignee || '-'}</td>
                      <td className="px-3 py-2 text-[var(--ink-muted-80)]">{reqTypeLabel(reqTypes, req.reqType)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination + Footer */}
        <div className="px-6 py-3 border-t border-[var(--hairline)] flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Pagination current={filters.page || 1} total={total} pageSize={PAGE_SIZE} onChange={(p) => handleFilterChange('page', p)} />
            <span className="text-[var(--ink-muted-80)]">共 {total} 个</span>
            {selectedIds.size > 0 && (
              <span className="text-[var(--primary)]" title={selectedIdPreview}>已选 {selectedIds.size} 个 (跨页)</span>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] text-sm">取消</button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || submitting}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50 text-sm"
            >
              {submitting ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
              添加 ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSelect<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T | undefined;
  options: T[] | { value: T; label: string }[];
  onChange: (v: T | undefined) => void;
}) {
  const normalized = options.map((o) => typeof o === 'string' ? { value: o, label: o } : o);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      className="px-3 py-1.5 text-sm bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
    >
      <option value="">{label}（全部）</option>
      {normalized.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function hasActiveFilter(f: UnassignedRequirementsQuery): boolean {
  return !!(f.search || f.priority || f.status || f.assignee || f.reqType || f.module);
}

function reqTypeLabel(types: RequirementTypeItem[], code: string): string {
  return types.find((t) => t.code === code)?.displayName || code;
}

function Pagination({ current, total, pageSize, onChange }: { current: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div className="flex items-center gap-1 text-sm">
      {pages.map((p, i) => p === '...' ? (
        <span key={`e${i}`} className="px-2 text-[var(--ink-muted-80)]">…</span>
      ) : (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2.5 py-1 rounded ${p === current ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--canvas-parchment)] text-[var(--ink)]'}`}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
