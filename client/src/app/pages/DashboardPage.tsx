import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  FileText, Rocket, Loader2, BookOpen, Bot, Users, BookText,
  ChevronRight, Clock, TrendingUp, Target, CheckCircle, AlertCircle,
  BarChart3, Calendar, Flame,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  getDashboardStats,
  getCategoryHeatmap,
  type CategoryHeatmap,
} from '../../api/requirements';
import { authStore } from '../../stores/auth';
import { AppPageShell } from '../components/AppPageShell';
import { SurfaceCard } from '../components/SurfaceCard';

// 状态色优先用后端注入的 d.statusColor(来自 group 对应 workflow 的 WorkflowStatus.color)
// 兼容旧数据:沿用硬编码 map,再掉 #94a3b8
const STATUS_COLORS_FALLBACK: Record<string, string> = {
  '待评审': '#6c757d', '评审中': '#17a2b8', '设计中': '#ffc107',
  '开发中': '#0066cc', '测试中': '#fd7e14', '已完成': '#28a745', '已关闭': '#343a40',
};
function pickStatusColor(color: string | null | undefined, name: string): string {
  return color || STATUS_COLORS_FALLBACK[name] || '#94a3b8';
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#ff3b30', P1: '#ff9500', P2: '#0066cc', P3: '#34c759',
};

const PIE_COLORS = ['#0066cc', '#28a745', '#ff9500', '#17a2b8', '#6c757d', '#fd7e14', '#ffc107', '#343a40'];

const QUICK_ACTIONS = [
  { name: '需求管理', href: '/app/requirements', icon: FileText, color: '#2563eb' },
  { name: '发版计划', href: '/app/releases', icon: Rocket, color: '#0891b2' },
  { name: 'AI 助手', href: '/app/ai', icon: Bot, color: '#7c3aed' },
  { name: '操作手册', href: '/app/manuals', icon: BookOpen, color: '#059669' },
  { name: '帮助中心', href: '/app/help', icon: BookText, color: '#6b7280' },
  { name: '团队管理', href: '/app/team', icon: Users, color: '#ea580c' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export function DashboardPage() {
  const currentUser = authStore.currentUser;
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getDashboardStats>> | null>(null);
  const [heatmap, setHeatmap] = useState<CategoryHeatmap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getCategoryHeatmap(6).catch(() => null)])
      .then(([s, h]) => { setStats(s); setHeatmap(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppPageShell maxWidth="full">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--clay)]" />
        </div>
      </AppPageShell>
    );
  }

  if (!stats) return null;

  // Status bar data
  const statusBarData = stats.statusDistribution.map(d => ({
    name: d.status,
    count: d.count,
    fill: pickStatusColor(d.statusColor, d.status),
  }));

  // Priority pie data
  const pieData = stats.priorityDistribution.map(d => ({
    name: d.priority,
    value: d.count,
    fill: PRIORITY_COLORS[d.priority] || '#94a3b8',
  }));

  const total = stats.totalRequirements || 1;

  return (
    <AppPageShell maxWidth="full">
      <p className="text-[13px] text-[var(--mid)] mb-4">
        欢迎回来，<span className="font-semibold text-[var(--ink)]">{currentUser?.displayName ?? '用户'}</span>
      </p>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="需求总数" value={stats.totalRequirements} href="/app/requirements" />
        <StatCard label="进行中" value={stats.inProgress} href="/app/requirements?status=开发中" />
        <StatCard label="测试通过率" value={stats.testStats.passRate != null ? `${stats.testStats.passRate}%` : '-'} href="/app/requirements" />
        <StatCard label="待审核发版" value={stats.pendingReviewReleases} href="/app/releases" />
      </div>

      {/* ── Quick Actions ── */}
      <div className="mb-4">
        <h3 className="card-header-title mb-3 flex items-center gap-1.5">
          <Target size={14} className="normal-case tracking-normal" /> 快速入口
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.name} to={action.href} className="block">
              <SurfaceCard hover padding="sm" className="text-center">
                <div className="flex justify-center mb-2">
                  <div
                    className="inline-flex p-2.5"
                    style={{ background: `${action.color}18` }}
                  >
                    <action.icon size={20} strokeWidth={1.75} style={{ color: action.color }} />
                  </div>
                </div>
                <p className="text-[12px] font-semibold text-[var(--ink)] leading-tight">{action.name}</p>
              </SurfaceCard>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {/* Status Distribution */}
        <SurfaceCard padding="md">
          <h3 className="card-header-title mb-4 flex items-center gap-2 normal-case tracking-normal">
            <BarChart3 size={16} /> 需求状态分布
          </h3>
          {statusBarData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={statusBarData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#7a7a7a' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#7a7a7a' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12 }}
                    cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={28}>
                    {statusBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-2">
                {statusBarData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted-80)]">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                    {d.name} ({d.count})
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">暂无数据</p>
          )}
        </SurfaceCard>

        {/* Priority + Test Stats */}
        <SurfaceCard padding="md">
          <h3 className="card-header-title mb-4 flex items-center gap-2 normal-case tracking-normal">
            <TrendingUp size={16} /> 优先级分布 & 测试统计
          </h3>
          <div className="flex gap-6">
            {/* Priority Pie */}
            <div className="flex-1">
              <p className="text-[12px] text-[var(--ink-muted-80)] mb-2 text-center">优先级</p>
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={pieData} innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value" strokeWidth={0}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-3 mt-1">
                    {pieData.map(d => (
                      <div key={d.name} className="flex items-center gap-1 text-[11px] text-[var(--ink-muted-80)]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                        {d.name}: {d.value}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--ink-muted-48)] text-center py-6">暂无数据</p>
              )}
            </div>

            {/* Test Stats */}
            <div className="w-40 space-y-3">
              <p className="text-[12px] text-[var(--ink-muted-80)] mb-1">测试统计</p>
              <TestStatItem label="用例总数" value={stats.testStats.totalCases} />
              <TestStatItem label="通过" value={stats.testStats.passedCases} color="text-green-600" />
              <TestStatItem label="失败" value={stats.testStats.failedCases} color="text-red-600" />
              <TestStatItem label="回归套件" value={stats.testStats.regressionSuites} />
              <TestStatItem label="执行次数" value={stats.testStats.activeRegressions} />
            </div>
          </div>
        </SurfaceCard>
      </div>

      {/* ── Lists Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* Recent Requirements */}
        <SurfaceCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Clock size={16} /> 最近需求
            </h3>
            <Link to="/app/requirements" className="link-accent">
              查看全部 <ChevronRight size={10} className="inline" />
            </Link>
          </div>
          {stats.recentRequirements.length > 0 ? (
            <div className="space-y-2.5">
              {stats.recentRequirements.map(req => (
                <Link key={req.id} to={`/app/requirements/${req.id}`} className="block group">
                  <div className="p-2.5 rounded-lg bg-[var(--canvas-parchment)] border border-transparent hover:border-[var(--hairline)] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--ink)] truncate group-hover:text-[var(--clay)] transition-colors">{req.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono text-[var(--ink-muted-48)]">{req.reqNo}</span>
                          <StatusBadge status={req.status} statusColor={req.statusColor} />
                        </div>
                      </div>
                      <span className="text-[10px] text-[var(--ink-muted-48)] shrink-0 ml-2">{formatDate(req.updatedAt)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">暂无需求</p>
          )}
        </SurfaceCard>

        {/* My Assigned */}
        <SurfaceCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <AlertCircle size={16} /> 我的任务
            </h3>
            <Link to={`/app/requirements?assignee=${currentUser?.username}`} className="link-accent">
              查看全部 <ChevronRight size={10} className="inline" />
            </Link>
          </div>
          {stats.myAssigned.length > 0 ? (
            <div className="space-y-2.5">
              {stats.myAssigned.map(req => (
                <Link key={req.id} to={`/app/requirements/${req.id}`} className="block group">
                  <div className="p-2.5 rounded-lg bg-[var(--canvas-parchment)] border border-transparent hover:border-[var(--hairline)] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--ink)] truncate group-hover:text-[var(--clay)] transition-colors">{req.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-mono text-[var(--ink-muted-48)]">{req.reqNo}</span>
                          <PriorityBadge priority={req.priority} />
                        </div>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">暂无分配任务</p>
          )}
        </SurfaceCard>

        {/* Upcoming Releases */}
        <SurfaceCard padding="md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Calendar size={16} /> 近期发版
            </h3>
            <Link to="/app/releases" className="link-accent">
              查看全部 <ChevronRight size={10} className="inline" />
            </Link>
          </div>
          {stats.upcomingReleases.length > 0 ? (
            <div className="space-y-2.5">
              {stats.upcomingReleases.map(rel => (
                <Link key={rel.id} to={`/app/releases/${rel.id}`} className="block group">
                  <div className="p-2.5 rounded-lg bg-[var(--canvas-parchment)] border border-transparent hover:border-[var(--hairline)] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--ink)] truncate group-hover:text-[var(--clay)] transition-colors">{rel.releaseName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-[var(--ink-muted-48)]">{rel.reqCount} 个需求</span>
                          {rel.plannedDate && (
                            <span className="text-[11px] text-[var(--ink-muted-48)]">计划: {rel.plannedDate}</span>
                          )}
                        </div>
                      </div>
                      <ReleaseStatusBadge status={rel.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">暂无发版计划</p>
          )}
        </SurfaceCard>

        <CategoryHeatmap data={heatmap} />
      </div>
    </AppPageShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function StatCard({ label, value, href }: { label: string; value: number | string; href: string }) {
  return (
    <Link to={href} className="block group">
      <div className="stat-card transition-colors group-hover:border-[var(--text)]">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </Link>
  );
}

function TestStatItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--ink-muted-80)]">{label}</span>
      <span className={`text-[13px] font-semibold ${color ?? 'text-[var(--ink)]'}`}>{value}</span>
    </div>
  );
}

function StatusBadge({ status, statusColor }: { status: string; statusColor?: string | null }) {
  const color = pickStatusColor(statusColor, status);
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-white" style={{ backgroundColor: color }}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || '#94a3b8';
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: `${color}15`, color }}>
      {priority}
    </span>
  );
}

function ReleaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLANNED: 'bg-blue-50 text-blue-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    IN_REVIEW: 'bg-purple-50 text-purple-700',
    RELEASED: 'bg-green-50 text-green-700',
    CANCELLED: 'bg-gray-50 text-gray-600',
  };
  const labelMap: Record<string, string> = {
    PLANNED: '计划中', IN_PROGRESS: '进行中', IN_REVIEW: '审核中', RELEASED: '已发布', CANCELLED: '已取消',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${map[status] || 'bg-gray-50 text-gray-600'}`}>
      {labelMap[status] || status}
    </span>
  );
}

// ── Category Heatmap (GitHub contribution style) ────────────────────

function CategoryHeatmap({ data }: { data: CategoryHeatmap | null }) {
  if (!data) return null;
  const { weekStartDates, categories, maxCount } = data;
  if (categories.length === 0) {
    return (
      <SurfaceCard>
        <div className="flex items-center gap-2 mb-2">
          <Flame size={16} className="text-[var(--clay)]" />
          <h3 className="text-[var(--ink)]">分类需求热力图</h3>
        </div>
        <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">近 6 周暂无新建需求</p>
      </SurfaceCard>
    );
  }

  // 5 档颜色：0(灰) 1(浅红) 2(中红) 3(深红) 4(最深红)
  const heat = (count: number) => {
    if (count === 0 || maxCount === 0) return 'bg-[#ebedf0]';
    const ratio = count / maxCount;
    if (ratio <= 0.25) return 'bg-[#fdd6cd]';
    if (ratio <= 0.5) return 'bg-[#f5a896]';
    if (ratio <= 0.75) return 'bg-[#ec7a5f]';
    return 'bg-[#c4492f]';
  };

  return (
    <SurfaceCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame size={16} className="text-[var(--clay)]" />
          <h3 className="text-[var(--ink)]">分类需求热力图</h3>
          <span className="text-[12px] text-[var(--ink-muted-48)]">近 6 周新建分布</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--ink-muted-48)]">
          <span>少</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-[#ebedf0]" />
            <div className="w-3 h-3 rounded-sm bg-[#fdd6cd]" />
            <div className="w-3 h-3 rounded-sm bg-[#f5a896]" />
            <div className="w-3 h-3 rounded-sm bg-[#ec7a5f]" />
            <div className="w-3 h-3 rounded-sm bg-[#c4492f]" />
          </div>
          <span>多</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: '3px 3px' }}>
          <thead>
            <tr>
              <th className="text-left text-[11px] font-normal text-[var(--ink-muted-48)] pr-2 w-32">分类</th>
              {weekStartDates.map((d) => (
                <th key={d} className="text-center text-[10px] font-normal text-[var(--ink-muted-48)] px-1" style={{ minWidth: 28 }}>
                  {d.slice(5)}
                </th>
              ))}
              <th className="text-center text-[11px] font-normal text-[var(--ink-muted-48)] pl-2" style={{ minWidth: 36 }}>总计</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="text-[12px] text-[var(--ink)] pr-2 truncate" title={c.name} style={{ maxWidth: 120 }}>
                  <Link
                    to={`/app/requirements?categoryId=${c.id}`}
                    className="hover:text-[var(--clay)] transition-colors"
                  >
                    {c.name}
                  </Link>
                </td>
                {c.weeks.map((w) => (
                  <td key={w.date} className="p-0">
                    <Link
                      to={`/app/requirements?categoryId=${c.id}&from=${w.date}`}
                      className={`block w-7 h-7 rounded-sm ${heat(w.count)} hover:ring-1 hover:ring-[var(--clay)] transition-shadow`}
                      title={`${c.name} · ${w.date}（共 ${w.count} 条，未完成 ${w.uncompleted} 条）`}
                    />
                  </td>
                ))}
                <td className="text-center text-[12px] font-medium text-[var(--ink)] pl-2">{c.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}
