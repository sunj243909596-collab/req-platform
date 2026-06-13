import { Link, useLocation } from 'react-router';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

const routeMap: Record<string, string> = {
  app: '工作台',
  requirements: '需求管理',
  releases: '发版计划',
  ai: 'AI 助手',
  team: '团队管理',
  settings: '系统设置',
  new: '新建',
};

export function Breadcrumb() {
  const location = useLocation();
  const pathnames = location.pathname.split('/').filter((x) => x);

  // 'app' 是路由分组前缀（DashboardLayout 的公共壳子），不是真实层级。
  // 在 sidebar 中，工作台(/app)、需求管理(/app/requirements)、团队管理(/app/team) 等
  // 都是 'app' 的同级子项，所以面包屑里要跳过 'app' 段，否则会把同级显示成父子。
  const segments = pathnames
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => seg !== 'app');

  const breadcrumbs: BreadcrumbItem[] = [
    { label: '首页', path: '/app' },
  ];

  segments.forEach(({ seg, i }) => {
    const path = `/${pathnames.slice(0, i + 1).join('/')}`;
    const label = routeMap[seg] || seg;

    // 如果是数字ID，使用通用标签
    if (/^\d+$/.test(seg)) {
      breadcrumbs.push({ label: '详情' });
    } else {
      breadcrumbs.push({ label, path });
    }
  });

  // 如果只有首页，不显示面包屑
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center gap-2 text-sm text-[var(--ink-muted-80)] mb-6">
      {breadcrumbs.map((crumb, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight size={14} />}
          {index === 0 && <Home size={14} />}
          {crumb.path && index !== breadcrumbs.length - 1 ? (
            <Link
              to={crumb.path}
              className="hover:text-[var(--clay)] transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className={index === breadcrumbs.length - 1 ? 'text-[var(--ink)]' : ''}>
              {crumb.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
