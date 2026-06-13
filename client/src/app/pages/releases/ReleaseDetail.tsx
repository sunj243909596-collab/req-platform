import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft, Calendar, User, CheckCircle2, Clock, Send,
  Loader2, AlertTriangle, ShieldCheck, Edit, Plus, X, Search
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Breadcrumb } from '../../components/Breadcrumb';
import { getRelease, submitReleaseForReview, addRequirementsToRelease, removeRequirementFromRelease, getUnassignedRequirements, type ReleaseInfo } from '../../../api/releases';
import { listRequirements, type RequirementListItem } from '../../../api/requirements';

const STATUS_LABELS: Record<string, string> = {
  PLANNED: '规划中',
  IN_DEV: '开发中',
  IN_REVIEW: '待审核',
  RELEASED: '已发布',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  PLANNED: '#6c757d',
  IN_DEV: '#0066cc',
  IN_REVIEW: '#ffc107',
  RELEASED: '#28a745',
  CLOSED: '#6c757d',
  CANCELLED: '#dc3545',
};

const REQ_STATUS_LABELS: Record<string, string> = {
  // fallback(优先用后端注入的 req.statusColor)
  '待评审': '#6c757d', '评审中': '#17a2b8', '设计中': '#ffc107',
  '开发中': '#0066cc', '测试中': '#fd7e14', '已完成': '#28a745',
};
function pickReqStatusColor(reqStatusColor: string | null | undefined, name: string): string {
  return reqStatusColor || REQ_STATUS_LABELS[name] || '#6c757d';
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#ff3b30', P1: '#ff9500', P2: '#0066cc', P3: '#34c759',
};

export function ReleaseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [requirements, setRequirements] = useState<RequirementListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Requirement management
  const [showManageModal, setShowManageModal] = useState(false);
  const [availableReqs, setAvailableReqs] = useState<{ id: number; reqNo: string; title: string; priority: string; status: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [reqSearch, setReqSearch] = useState('');
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const openManageModal = async () => {
    setShowManageModal(true);
    setLoadingAvailable(true);
    try {
      const reqs = await getUnassignedRequirements(parseInt(id!), release?.groupName);
      setAvailableReqs(reqs);
    } catch {
      toast.error('加载可选需求失败');
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleAddRequirements = async () => {
    if (selectedIds.length === 0) { toast.error('请选择需求'); return; }
    try {
      await addRequirementsToRelease(parseInt(id!), selectedIds);
      toast.success(`已添加 ${selectedIds.length} 个需求`);
      setSelectedIds([]);
      setShowManageModal(false);
      fetchData(); // refresh
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleRemoveRequirement = async (reqId: number, reqNo: string) => {
    if (!confirm(`确定要移除需求 ${reqNo} 吗？`)) return;
    try {
      await removeRequirementFromRelease(parseInt(id!), reqId);
      toast.success('已移除');
      fetchData(); // refresh
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    }
  };

  const filteredAvailable = reqSearch
    ? availableReqs.filter(r =>
        r.title.toLowerCase().includes(reqSearch.toLowerCase()) ||
        r.reqNo.toLowerCase().includes(reqSearch.toLowerCase()))
    : availableReqs;

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const releaseId = parseInt(id);
    try {
      const [rel, reqs] = await Promise.all([
        getRelease(releaseId),
        listRequirements({ page: 1, pageSize: 100, releaseId }),
      ] as const);
      setRelease(rel);
      setRequirements(reqs.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSubmitForReview = async () => {
    if (!release || !id) return;
    setSubmitting(true);
    try {
      const updated = await submitReleaseForReview(parseInt(id));
      setRelease(updated);
      toast.success('已提交审核');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="p-6 text-center py-32">
        <p className="text-[var(--destructive)] mb-4">{error || '发版不存在'}</p>
        <Link to="/app/releases" className="text-[var(--primary)] hover:underline">
          返回发版列表
        </Link>
      </div>
    );
  }

  const statusCounts: Record<string, number> = {};
  for (const req of requirements) {
    statusCounts[req.status] = (statusCounts[req.status] || 0) + 1;
  }

  const allStatuses = ['待评审', '评审中', '设计中', '开发中', '测试中', '已完成'];
  const completedCount = statusCounts['已完成'] || 0;
  const totalCount = requirements.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const canSubmitForReview =
    completedCount === totalCount && totalCount > 0 && release.status === 'IN_DEV';

  return (
    <div className="p-6">
      <div className="max-w-[1200px] mx-auto">
        <Breadcrumb />
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/app/releases"
            className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft size={18} /> 返回发版列表
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-[var(--ink)]">{release.versionNo}</h2>
                <span className="px-3 py-1 rounded-[1px] text-xs font-semibold text-white"
                  style={{ backgroundColor: STATUS_COLORS[release.status] || '#6c757d' }}>
                  {STATUS_LABELS[release.status] || release.status}
                </span>
              </div>
              <h3 className="text-[var(--ink-muted-80)] mb-4">{release.releaseName}</h3>
              <div className="flex flex-wrap gap-4 text-sm text-[var(--ink-muted-80)]">
                <div className="flex items-center gap-2">
                  <User size={16} /> <span>负责人: {release.owner || '未分配'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} /> <span>计划日期: {release.plannedDate?.slice(0, 10) || '未指定'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={`/app/releases/${id}/edit`}
                className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
              >
                <Edit size={18} /> <span>编辑</span>
              </Link>
              {canSubmitForReview ? (
              <button
                onClick={handleSubmitForReview}
                disabled={submitting}
                className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                <span>提交审核</span>
              </button>
            ) : (
              <button
                disabled
                className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--muted)] text-[var(--ink-muted-48)] rounded-[var(--radius-pill)] cursor-not-allowed"
              >
                <Clock size={18} />
                <span>{release.status === 'IN_REVIEW' ? '审核中' : '未达审核条件'}</span>
              </button>
            )}
            </div>
          </div>
        </div>

        {/* Progress Overview */}
        <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-5 mb-5">
          <h4 className="mb-4 text-[var(--ink)]">整体进度</h4>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[var(--ink-muted-80)]">需求完成度</span>
              <span className="text-[var(--ink)] font-semibold text-lg">
                {completedCount}/{totalCount} ({progressPercent.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full h-4 bg-[var(--canvas-parchment)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-5">
            {allStatuses.map((status) => (
              <div key={status} className="text-center">
                <div className="text-2xl font-semibold mb-1" style={{ color: REQ_STATUS_LABELS[status] }}>
                  {statusCounts[status] || 0}
                </div>
                <div className="text-xs text-[var(--ink-muted-80)]">{status}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        {release.description && (
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 mb-6">
            <h4 className="mb-3 text-[var(--ink)]">发版说明</h4>
            <p className="text-[var(--ink-muted-80)] leading-relaxed whitespace-pre-wrap">{release.description}</p>
          </div>
        )}

        {/* Requirements List */}
        <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] overflow-hidden">
          <div className="p-5 border-b border-[var(--hairline)]">
            <div className="flex items-center justify-between">
              <h4 className="text-[var(--ink)]">包含的需求</h4>
              {release.status !== 'RELEASED' && release.status !== 'CANCELLED' && (
                <button
                  onClick={openManageModal}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                >
                  <Plus size={14} /> 管理需求
                </button>
              )}
            </div>
          </div>
          {requirements.length === 0 ? (
            <div className="text-center py-12 text-[var(--ink-muted-80)]">
              <p className="mb-3">暂无关联需求</p>
              {release.status !== 'RELEASED' && release.status !== 'CANCELLED' && (
                <button
                  onClick={openManageModal}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                >
                  <Plus size={14} /> 添加需求
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead className="bg-[var(--canvas-parchment)] border-b border-[var(--hairline)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">编号</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">标题</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">优先级</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">状态</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">负责人</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-[var(--ink)]">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hairline)]">
                  {requirements.map((req) => (
                    <tr key={req.id} className="hover:bg-[var(--canvas-parchment)] transition-colors">
                      <td className="px-6 py-4">
                        <Link to={`/app/requirements/${req.id}`} className="text-[var(--primary)] hover:underline font-mono text-sm">
                          {req.reqNo}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[var(--ink)]">{req.title}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="table-badge inline-block px-3 py-1 rounded-[1px] text-xs font-semibold text-white"
                          style={{ backgroundColor: PRIORITY_COLORS[req.priority] || '#6c757d' }}>
                          {req.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {req.status === '已完成' && <CheckCircle2 size={16} className="text-[#28a745]" />}
                          <span className="table-badge inline-block px-3 py-1 rounded-[1px] text-xs font-semibold text-white"
                            style={{ backgroundColor: pickReqStatusColor(req.statusColor, req.status) }}>
                            {req.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-[var(--ink)]">{req.assignee || '-'}</span>
                      </td>
                      <td className="px-6 py-4">
                        {release.status !== 'RELEASED' && release.status !== 'CANCELLED' ? (
                          <button
                            onClick={() => handleRemoveRequirement(req.id, req.reqNo)}
                            className="text-sm text-[var(--destructive)] hover:opacity-70"
                          >
                            移除
                          </button>
                        ) : (
                          <span className="text-sm text-[var(--ink-muted-80)]">已锁定</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Audit Validation */}
        {!canSubmitForReview && release.status !== 'RELEASED' && release.status !== 'IN_REVIEW' && (
          <div className="mt-6 bg-[#fff3cd] border border-[#ffc107] rounded-[var(--radius-lg)] p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-[#ff9500] mt-0.5" />
              <div>
                <h4 className="text-[var(--ink)] mb-1">审核条件检查</h4>
                <p className="text-sm text-[var(--ink-muted-80)]">
                  当前有 {totalCount - completedCount} 个需求未完成，无法提交审核。
                  <br />
                  要求：所有需求必须完成。
                </p>
              </div>
            </div>
          </div>
        )}

        {release.status === 'IN_REVIEW' && (
          <div className="mt-6 bg-[#e8f5e9] border border-[#4caf50] rounded-[var(--radius-lg)] p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="text-[#4caf50] mt-0.5" />
              <div>
                <h4 className="text-[var(--ink)] mb-1">发版审核中</h4>
                <p className="text-sm text-[var(--ink-muted-80)]">
                  此发版已提交审核，等待审核人确认。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manage Requirements Modal */}
      {showManageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-xl mx-4 max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[var(--ink)]">管理需求</h3>
              <button onClick={() => { setShowManageModal(false); setSelectedIds([]); setReqSearch(''); }} className="p-1 hover:bg-[var(--canvas-parchment)] rounded">
                <X size={20} className="text-[var(--ink-muted-80)]" />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-80)]" />
              <input
                type="text"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder="搜索需求编号或标题..."
                className="w-full pl-9 pr-4 py-2.5 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
              />
            </div>

            {/* Count */}
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-[var(--ink-muted-80)]">已选 {selectedIds.length} 个</span>
              <span className="text-[var(--ink-muted-80)]">共 {filteredAvailable.length} 个可选</span>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto border border-[var(--hairline)] rounded-[var(--radius-md)] mb-4">
              {loadingAvailable ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : filteredAvailable.length === 0 ? (
                <p className="text-center py-8 text-sm text-[var(--ink-muted-80)]">
                  {reqSearch ? '无匹配结果' : '没有可关联的需求'}
                </p>
              ) : (
                filteredAvailable.map(req => {
                  const isSelected = selectedIds.includes(req.id);
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setSelectedIds(prev => prev.includes(req.id) ? prev.filter(i => i !== req.id) : [...prev, req.id])}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[var(--hairline)] last:border-0 transition-colors ${
                        isSelected ? 'bg-[var(--primary)]/5' : 'hover:bg-[var(--canvas-parchment)]'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--hairline)]'
                      }`}>
                        {isSelected && <CheckCircle2 size={14} className="text-white" />}
                      </div>
                      <span className="font-mono text-sm text-[var(--ink-muted-80)] w-28">{req.reqNo}</span>
                      <span className="text-sm text-[var(--ink)] truncate flex-1">{req.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-[1px] text-white ${
                        req.priority === 'P0' ? 'bg-[#ff3b30]' : req.priority === 'P1' ? 'bg-[#ff9500]' : 'bg-[#0066cc]'
                      }`}>{req.priority}</span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowManageModal(false); setSelectedIds([]); setReqSearch(''); }}
                className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] text-sm"
              >
                取消
              </button>
              <button
                onClick={handleAddRequirements}
                disabled={selectedIds.length === 0}
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50 text-sm"
              >
                添加 ({selectedIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
