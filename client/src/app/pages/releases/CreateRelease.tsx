import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Search, Check, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { createRelease } from '../../../api/releases';
import { authStore } from '../../../stores/auth';
import { listGroups, type GroupInfo } from '../../../api/groups';
import { listRequirements, type RequirementListItem } from '../../../api/requirements';

export function CreateRelease() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const currentUser = authStore.currentUser;
  const [form, setForm] = useState({
    versionNo: '',
    releaseName: '',
    owner: '',
    plannedDate: '',
    description: '',
    groupName: currentUser?.groupName || '',
  });

  // Requirement selection
  const [availableReqs, setAvailableReqs] = useState<RequirementListItem[]>([]);
  const [selectedReqIds, setSelectedReqIds] = useState<number[]>([]);
  const [reqSearch, setReqSearch] = useState('');
  const [loadingReqs, setLoadingReqs] = useState(false);

  useEffect(() => {
    listGroups().then((gs) => {
      setGroups(gs);
      if (!form.groupName && gs.length > 0) {
        setForm((f) => ({ ...f, groupName: gs[0].groupName }));
      }
    }).catch(() => {});
  }, []);

  // Load requirements for selection
  useEffect(() => {
    setLoadingReqs(true);
    listRequirements({ page: 1, pageSize: 100, status: undefined })
      .then((res) => setAvailableReqs(res.data))
      .catch(() => {})
      .finally(() => setLoadingReqs(false));
  }, []);

  const filteredReqs = reqSearch
    ? availableReqs.filter(r =>
        r.title.toLowerCase().includes(reqSearch.toLowerCase()) ||
        r.reqNo.toLowerCase().includes(reqSearch.toLowerCase()))
    : availableReqs.filter(r => !r.releaseVersion); // only show unassigned

  const toggleReq = (id: number) => {
    setSelectedReqIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.versionNo.trim()) { toast.error('请输入版本号'); return; }
    if (!form.releaseName.trim()) { toast.error('请输入发版名称'); return; }

    setSubmitting(true);
    try {
      await createRelease({
        versionNo: form.versionNo.trim(),
        releaseName: form.releaseName.trim(),
        groupName: form.groupName,
        owner: form.owner || undefined,
        plannedDate: form.plannedDate || undefined,
        description: form.description || undefined,
        requirementIds: selectedReqIds.length > 0 ? selectedReqIds : undefined,
      });

      toast.success('发版创建成功！');
      navigate('/app/releases');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-[900px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/app/releases"
            className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft size={18} /> 返回发版列表
          </Link>
          <h2 className="mb-2">创建发版</h2>
          <p className="text-[var(--ink-muted-80)]">规划新的版本发布</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 mb-6">
            <div className="space-y-6">
              {/* Version & Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 text-[var(--ink)]">版本号 *</label>
                  <input
                    type="text"
                    value={form.versionNo}
                    onChange={(e) => handleChange('versionNo', e.target.value)}
                    placeholder="例如：V2.3.0"
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    required
                  />
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">发版名称 *</label>
                  <input
                    type="text"
                    value={form.releaseName}
                    onChange={(e) => handleChange('releaseName', e.target.value)}
                    placeholder="例如：扫码入库增强"
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    required
                  />
                </div>
              </div>

              {/* Owner & Planned Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 text-[var(--ink)]">负责人</label>
                  <input
                    type="text"
                    value={form.owner}
                    onChange={(e) => handleChange('owner', e.target.value)}
                    placeholder="例如：张三"
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">计划日期</label>
                  <input
                    type="date"
                    value={form.plannedDate}
                    onChange={(e) => handleChange('plannedDate', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Group selector */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">所属组 *</label>
                {currentUser?.role === 'ADMIN' ? (
                  <select
                    value={form.groupName}
                    onChange={(e) => handleChange('groupName', e.target.value)}
                    className="w-full max-w-xs px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.groupName}>{g.groupName}</option>
                    ))}
                  </select>
                ) : (
                  <div className="px-4 py-3 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] max-w-xs">
                    {form.groupName || '未分配组'}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">发版说明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="描述本次发版的主要内容和目标..."
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={4}
                />
              </div>

              {/* Requirement Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[var(--ink)]">关联需求</label>
                  <span className="text-xs text-[var(--ink-muted-80)]">
                    已选 {selectedReqIds.length} 个
                  </span>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-80)]" />
                  <input
                    type="text"
                    value={reqSearch}
                    onChange={(e) => setReqSearch(e.target.value)}
                    placeholder="搜索需求编号或标题..."
                    className="w-full pl-9 pr-4 py-2.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                  />
                </div>

                {/* Selected badges */}
                {selectedReqIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedReqIds.map(id => {
                      const req = availableReqs.find(r => r.id === id);
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded-[var(--radius-pill)] text-sm">
                          {req ? req.reqNo : `#${id}`}
                          <button type="button" onClick={() => toggleReq(id)} className="hover:opacity-70">
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Requirement list */}
                <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] max-h-64 overflow-y-auto">
                  {loadingReqs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
                    </div>
                  ) : filteredReqs.length === 0 ? (
                    <p className="text-center py-6 text-sm text-[var(--ink-muted-80)]">
                      {reqSearch ? '无匹配结果' : '暂无可关联的需求'}
                    </p>
                  ) : (
                    filteredReqs.map(req => {
                      const isSelected = selectedReqIds.includes(req.id);
                      return (
                        <button
                          key={req.id}
                          type="button"
                          onClick={() => toggleReq(req.id)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[var(--hairline)] last:border-0 transition-colors ${
                            isSelected ? 'bg-[var(--primary)]/5' : 'hover:bg-[var(--canvas-parchment)]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--hairline)]'
                          }`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <span className="font-mono text-sm text-[var(--ink-muted-80)]">{req.reqNo}</span>
                          <span className="text-sm text-[var(--ink)] truncate flex-1">{req.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: req.priority === 'P0' ? '#ff3b30' : req.priority === 'P1' ? '#ff9500' : '#0066cc' }}>
                            {req.priority}
                          </span>
                          <span className="text-xs text-[var(--ink-muted-80)]">{req.status}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              to="/app/releases"
              className="px-6 py-3 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> 创建中...</span>
              ) : `创建发版${selectedReqIds.length > 0 ? ` (${selectedReqIds.length} 个需求)` : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
