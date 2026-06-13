import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Trash2, RotateCcw, Search, X, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { AppPageShell } from '../../components/AppPageShell';
import { PageHeader } from '../../components/PageHeader';
import { SurfaceCard } from '../../components/SurfaceCard';
import {
  listTrashRequirements,
  restoreRequirement,
  permanentlyDeleteRequirement,
  batchRestoreRequirements,
  batchPermanentlyDeleteRequirements,
  type TrashItem,
} from '../../../api/requirements';
import { authStore } from '../../../stores/auth';

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  P0: { bg: '#fef2f2', color: '#dc2626' },
  P1: { bg: '#fff7ed', color: '#ea580c' },
  P2: { bg: '#eff6ff', color: '#2563eb' },
  P3: { bg: '#f0fdf4', color: '#16a34a' },
};

export function RequirementsTrash() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';

  const [items, setItems] = useState<TrashItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTrashRequirements({
        page,
        pageSize,
        search: search || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // 清掉不在当前页的选中
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(items.map((r) => r.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const allSelected = items.length > 0 && items.every((r) => selectedIds.has(r.id));
  const someSelected = items.some((r) => selectedIds.has(r.id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (allSelected ? new Set() : new Set(items.map((r) => r.id))));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleRestore = async (id: number) => {
    setWorking(true);
    try {
      await restoreRequirement(id);
      toast.success('已还原');
      clearSelection();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '还原失败');
    } finally {
      setWorking(false);
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (!isAdmin) {
      toast.error('仅管理员可永久删除');
      return;
    }
    if (!window.confirm(`确定要永久删除 ${item.reqNo}「${item.title}」吗？\n此操作不可恢复，需求及相关数据将彻底从数据库删除。`)) return;
    setWorking(true);
    try {
      await permanentlyDeleteRequirement(item.id);
      toast.success('已永久删除');
      clearSelection();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '永久删除失败');
    } finally {
      setWorking(false);
    }
  };

  const handleBatchRestore = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`确定要还原选中的 ${ids.length} 条需求吗？`)) return;
    setWorking(true);
    try {
      const res = await batchRestoreRequirements(ids);
      toast.success(`已还原 ${res.restored} 条`);
      clearSelection();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '批量还原失败');
    } finally {
      setWorking(false);
    }
  };

  const handleBatchPermanentDelete = async () => {
    if (!isAdmin) {
      toast.error('仅管理员可永久删除');
      return;
    }
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`确定要永久删除选中的 ${ids.length} 条需求吗？\n此操作不可恢复！`)) return;
    setWorking(true);
    try {
      const res = await batchPermanentlyDeleteRequirements(ids);
      toast.success(`已永久删除 ${res.deleted} 条`);
      clearSelection();
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '批量永久删除失败');
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppPageShell maxWidth="1400px">
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={() => navigate('/app/requirements')}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--ink)] transition-colors"
        >
          <ArrowLeft size={14} /> 返回需求列表
        </button>
      </div>
      <PageHeader
        title="需求回收站"
        description={`已删除的需求保留 30 天以上的可能性较低（系统不自动清理）。当前共 ${total} 条已删除需求${!isAdmin ? '（仅显示当前组）' : ''}。`}
      />

      {!isAdmin && (
        <div className="mb-4 flex items-start gap-2 p-3 border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas-parchment)] text-[12px] text-[var(--ink-muted-80)]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[var(--destructive)]" />
          <span>你当前是普通用户，只能查看/还原自己组的需求。<strong>永久删除仅 admin 可操作</strong>。请联系 admin 处理。</span>
        </div>
      )}

      {/* 工具栏 */}
      <SurfaceCard padding="md" className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索标题或编号"
              className="w-48 px-2.5 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors"
            >
              <Search size={12} /> 搜索
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--ink)] transition-colors"
              >
                <X size={12} /> 清除
              </button>
            )}
          </div>

          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ink-muted-80)]">已选 {selectedIds.size} 条</span>
              <button onClick={clearSelection} className="px-2 py-1.5 text-xs text-[var(--ink-muted-80)] hover:text-[var(--ink)] transition-colors">取消</button>
              <button
                onClick={handleBatchRestore}
                disabled={working}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-success text-white rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {working ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                批量还原
              </button>
              {isAdmin && (
                <button
                  onClick={handleBatchPermanentDelete}
                  disabled={working}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[var(--destructive)] text-white rounded-[var(--radius-md)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {working ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  永久删除
                </button>
              )}
            </div>
          )}
        </div>
      </SurfaceCard>

      {/* 表格 */}
      <SurfaceCard padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-[var(--ink-muted-80)]">
            <Trash2 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">回收站是空的</p>
            {search && <p className="text-[11px] mt-1">无匹配「{search}」的已删除需求</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)]">
                <tr>
                  <th className="px-3 py-2.5 text-center" style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">编号</th>
                  <th className="px-3 py-2.5 text-left font-medium">标题</th>
                  <th className="px-3 py-2.5 text-left font-medium">类型</th>
                  <th className="px-3 py-2.5 text-left font-medium">分类</th>
                  <th className="px-3 py-2.5 text-left font-medium">所属组</th>
                  <th className="px-3 py-2.5 text-left font-medium">优先级</th>
                  <th className="px-3 py-2.5 text-left font-medium">删除时间</th>
                  <th className="px-3 py-2.5 text-left font-medium">删除人</th>
                  <th className="px-3 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {items.map((r) => {
                  const pStyle = PRIORITY_STYLES[r.priority] ?? { bg: '#f3f4f6', color: '#6b7280' };
                  return (
                    <tr key={r.id} className={`hover:bg-[var(--surface-2)] transition-colors ${selectedIds.has(r.id) ? 'bg-[var(--primary)]/5' : ''}`}>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="w-3.5 h-3.5 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px] text-[var(--ink-muted-80)]">{r.reqNo}</td>
                      <td className="px-3 py-2">
                        <div className="max-w-xs">
                          <p className="truncate" title={r.title}>{r.title}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.reqTypeDisplay}</td>
                      <td className="px-3 py-2 text-xs text-[var(--ink-muted-80)] max-w-[180px] truncate" title={r.categoryPath}>
                        {r.categoryPath || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.groupName}</td>
                      <td className="px-3 py-2">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-[1px]" style={{ backgroundColor: pStyle.bg, color: pStyle.color }}>{r.priority}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-[var(--ink-muted-80)]">
                        {r.deletedAt ? new Date(r.deletedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-[var(--ink-muted-80)]">{r.deletedBy || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRestore(r.id)}
                            disabled={working}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] border border-[var(--hairline)] rounded-[1px] text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                            title="还原"
                          >
                            <RotateCcw size={11} /> 还原
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handlePermanentDelete(r)}
                              disabled={working}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] border border-[var(--hairline)] rounded-[1px] text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors disabled:opacity-50"
                              title="永久删除"
                            >
                              <Trash2 size={11} /> 永久删
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {!loading && total > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--hairline)] text-[12px] text-[var(--ink-muted-80)]">
            <span>共 {total} 条，第 {page} 页</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2.5 py-1 border border-[var(--hairline)] rounded-[1px] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-30"
              >
                上一页
              </button>
              <button
                type="button"
                disabled={page * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 border border-[var(--hairline)] rounded-[1px] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </SurfaceCard>
    </AppPageShell>
  );
}
