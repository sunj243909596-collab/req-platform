import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { getRelease, updateRelease, type ReleaseInfo } from '../../../api/releases';
import { authStore } from '../../../stores/auth';

const STATUS_OPTIONS = [
  { value: 'PLANNED', label: '规划中' },
  { value: 'IN_DEV', label: '开发中' },
  { value: 'IN_REVIEW', label: '待审核' },
  { value: 'RELEASED', label: '已发布' },
  { value: 'CLOSED', label: '已关闭' },
  { value: 'CANCELLED', label: '已取消' },
];

export function EditRelease() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  type FormStatus = 'PLANNED' | 'IN_DEV' | 'IN_REVIEW' | 'RELEASED' | 'CLOSED' | 'CANCELLED';
  const [form, setForm] = useState<{
    versionNo: string;
    releaseName: string;
    status: FormStatus;
    owner: string;
    plannedDate: string;
    description: string;
  }>({
    versionNo: '',
    releaseName: '',
    status: 'PLANNED',
    owner: '',
    plannedDate: '',
    description: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRelease(parseInt(id))
      .then((data) => {
        setRelease(data);
        setForm({
          versionNo: data.versionNo || '',
          releaseName: data.releaseName || '',
          status: (data.status as FormStatus) || 'PLANNED',
          owner: data.owner || '',
          plannedDate: data.plannedDate ? data.plannedDate.slice(0, 10) : '',
          description: data.description || '',
        });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.versionNo.trim() || !form.releaseName.trim()) {
      toast.error('版本号和发版名称不能为空');
      return;
    }

    setSubmitting(true);
    try {
      await updateRelease(parseInt(id), {
        versionNo: form.versionNo.trim(),
        releaseName: form.releaseName.trim(),
        status: form.status,
        owner: form.owner || undefined,
        plannedDate: form.plannedDate || undefined,
        description: form.description || undefined,
      });

      toast.success('发版更新成功！');
      navigate(`/app/releases/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
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

  if (!release) {
    return (
      <div className="p-6 text-center py-32">
        <p className="text-[var(--destructive)] mb-4">发版不存在</p>
        <Link to="/app/releases" className="text-[var(--primary)] hover:underline">
          返回发版列表
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-[900px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to={`/app/releases/${id}`}
            className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft size={18} /> 返回发版详情
          </Link>
          <h2 className="mb-2">编辑发版</h2>
          <p className="text-[var(--ink-muted-80)]">
            版本: <span className="font-mono">{release.versionNo}</span>
          </p>
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
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    required
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">状态</label>
                <select
                  value={form.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="w-full max-w-xs px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
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

              {/* Description */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">发版说明</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={6}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              to={`/app/releases/${id}`}
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
                <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> 保存中...</span>
              ) : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
