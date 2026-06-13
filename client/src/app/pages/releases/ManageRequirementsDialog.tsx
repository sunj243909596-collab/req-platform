import { useState, useEffect, useRef } from 'react';
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
            <FilterSelect label="类型" value={filters.reqType} options={reqTypes.map((t) => ({ value: t.code, label: t.name }))} onChange={(v) => handleFilterChange('reqType', v as ReqType | undefined)} />
            <FilterSelect label="模块" value={filters.module} options={moduleOptions} onChange={(v) => handleFilterChange('module', v)} />
          </div>
        </div>
        {/* 占位:筛选行 + 表格 + 分页 + 底部,后续任务填充 */}
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--ink-muted-80)]">
          筛选行 + 表格 + 分页 + 底部(下一任务)
        </div>
        {/* Footer (空) */}
        <div className="px-6 py-4 border-t border-[var(--hairline)] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] text-sm">
            取消
          </button>
          <button disabled className="px-6 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-sm opacity-50">
            添加 ({selectedIds.size})
          </button>
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
