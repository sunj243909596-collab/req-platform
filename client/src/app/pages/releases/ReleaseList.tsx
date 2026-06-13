import { Link, useNavigate } from 'react-router';
import { Plus, Calendar, CheckCircle2, Loader2, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { AppPageShell } from '../../components/AppPageShell';
import { PageHeader } from '../../components/PageHeader';
import { SurfaceCard } from '../../components/SurfaceCard';
import { EmptyState } from '../../components/EmptyState';
import { listReleases, deleteRelease, type ReleaseInfo } from '../../../api/releases';

const statusLabels: Record<string, string> = {
  PLANNED: '规划中',
  IN_DEV: '开发中',
  IN_REVIEW: '待审核',
  RELEASED: '已发布',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};

const statusColors: Record<string, string> = {
  PLANNED: '#6c757d',
  IN_DEV: '#0066cc',
  IN_REVIEW: '#ffc107',
  RELEASED: '#28a745',
  CLOSED: '#6c757d',
  CANCELLED: '#dc3545',
};

export function ReleaseList() {
  const navigate = useNavigate();
  const [releases, setReleases] = useState<ReleaseInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReleases = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listReleases({ page: 1, pageSize: 50 });
      setReleases(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReleases(); }, []);

  const handleDelete = async (e: React.MouseEvent, rel: ReleaseInfo) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定要删除发版 "${rel.versionNo}" 吗？`)) return;
    try {
      await deleteRelease(rel.id);
      toast.success('发版已删除');
      fetchReleases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <AppPageShell>
          <PageHeader
            title="发版计划"
            description="管理版本规划和发布流程"
            actions={
              <Link
                to="/app/releases/new"
                className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 text-sm"
              >
                <Plus size={18} /> <span>创建发版</span>
              </Link>
            }
          />

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-[var(--destructive)] mb-4">{error}</p>
              <button onClick={fetchReleases} className="px-4 py-2 text-sm text-[var(--primary)] hover:underline">重试</button>
            </div>
          )}

          {!loading && !error && releases.length === 0 && (
            <EmptyState
              title="暂无发版计划"
              description="创建第一个发版计划来组织需求"
              actionLabel="创建发版"
              actionTo="/app/releases/new"
            />
          )}

          {!loading && !error && releases.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {releases.map((rel, index) => (
                  <div key={rel.id} className="group relative cursor-pointer" onClick={() => navigate(`/app/releases/${rel.id}`)}>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{ y: -4, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)' }}
                      className="surface-card bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-5 shadow-[var(--shadow-card)] transition-all hover:border-[var(--primary)] hover:shadow-[var(--shadow-card-hover)]"
                    >
                      <div className="mb-3">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-[var(--ink)]">{rel.versionNo}</h4>
                          <span className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                            style={{ backgroundColor: statusColors[rel.status] || '#6c757d' }}>
                            {statusLabels[rel.status] || rel.status}
                          </span>
                        </div>
                        <h3 className="text-[var(--ink-muted-80)] text-base">{rel.releaseName}</h3>
                      </div>
                      {rel.description && (
                        <p className="text-sm text-[var(--ink-muted-80)] mb-3 line-clamp-2">{rel.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--hairline)]">
                        <div className="flex items-center gap-2 text-sm text-[var(--ink-muted-80)]">
                          <Calendar size={14} />
                          <span>{rel.plannedDate?.slice(0, 10) || '未指定'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-[var(--primary)] rounded-full flex items-center justify-center text-white text-xs font-semibold">
                            {(rel.owner || '?').charAt(0)}
                          </div>
                          <span className="text-sm text-[var(--ink)]">{rel.owner || '未分配'}</span>
                        </div>
                      </div>
                    </motion.div>
                    {/* Delete button — shown on hover */}
                    <button
                      onClick={(e) => handleDelete(e, rel)}
                      className="absolute top-3 right-3 p-2 text-[var(--ink-muted-80)] hover:text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] opacity-0 group-hover:opacity-100 transition-all"
                      title="删除发版"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Timeline View */}
              <SurfaceCard className="mt-8" padding="lg">
                <h3 className="mb-4 text-[var(--ink)] text-[18px] font-semibold">发版时间线</h3>
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--hairline)]" />
                  <div className="space-y-5">
                    {releases.map((rel) => (
                      <div key={rel.id} className="relative pl-12">
                        <div className="absolute left-0 top-2 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: statusColors[rel.status] || '#6c757d' }}>
                          {rel.status === 'RELEASED' ? (
                            <CheckCircle2 size={16} className="text-white" />
                          ) : (
                            <div className="w-3 h-3 bg-white rounded-full" />
                          )}
                        </div>
                        <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <Link to={`/app/releases/${rel.id}`} className="font-semibold text-[var(--ink)] hover:text-[var(--primary)]">
                                {rel.versionNo} - {rel.releaseName}
                              </Link>
                              <div className="text-sm text-[var(--ink-muted-80)] mt-1">
                                计划日期: {rel.plannedDate?.slice(0, 10) || '未指定'}
                              </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                              style={{ backgroundColor: statusColors[rel.status] || '#6c757d' }}>
                              {statusLabels[rel.status] || rel.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-[var(--ink-muted-80)]">
                            <span>负责人: {rel.owner || '未分配'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SurfaceCard>
            </>
          )}
    </AppPageShell>
  );
}
