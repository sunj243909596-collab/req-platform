import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import {
  FileText,
  Rocket,
  Bot,
  Users,
  Settings as SettingsIcon,
  User,
  Menu,
  X,
  LogOut,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Shield,
  UsersRound,
  BookText,
  LayoutDashboard,
  Trash2,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { authStore } from '../../stores/auth';
import { permissionStore } from '../../stores/permission';
import { usePermission } from '../hooks/usePermission';
import type { UserInfo } from '../../api/auth';
import { NotificationBell } from '../components/NotificationBell';

function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN': return '管理员';
    case 'GROUP_LEAD': return '组长';
    case 'MEMBER': return '成员';
    default: return role;
  }
}

interface NavItem {
  name: string;
  href: string;
  icon: typeof FileText;
  /** 权限码；不填则默认所有人都可见 */
  permission?: string;
}

const workflowNav: NavItem[] = [
  { name: '工作台', href: '/app', icon: LayoutDashboard, permission: 'page:dashboard' },
  { name: '需求管理', href: '/app/requirements', icon: FileText, permission: 'page:requirements' },
  { name: '发版计划', href: '/app/releases', icon: Rocket, permission: 'page:releases' },
  { name: 'AI 助手', href: '/app/ai', icon: Bot, permission: 'page:ai' },
  { name: '回收站', href: '/app/requirements/trash', icon: Trash2, permission: 'page:trash' },
];

const resourceNav: NavItem[] = [
  { name: '操作手册', href: '/app/manuals', icon: BookOpen, permission: 'page:manuals' },
  { name: '帮助中心', href: '/app/help', icon: BookText, permission: 'page:help' },
];

const managementNav: NavItem[] = [
  { name: '团队管理', href: '/app/team', icon: Users, permission: 'page:team' },
  { name: '设置', href: '/app/settings', icon: SettingsIcon, permission: 'page:settings' },
];

const allNav = [...workflowNav, ...resourceNav, ...managementNav];

function isNavActive(pathname: string, href: string): boolean {
  // 找所有匹配的 nav 项，取 href 最长的（最具体）那个为 active
  // 例：pathname=/app/requirements/trash 时，需求管理(/app/requirements) 和 回收站(/app/requirements/trash) 都匹配，
  // 但回收站 href 更长，所以只有回收站高亮
  const matches = allNav.filter((n) =>
    n.href === '/app' ? pathname === '/app' : pathname === n.href || pathname.startsWith(n.href + '/')
  );
  if (matches.length === 0) return false;
  const longest = matches.reduce((a, b) => (a.href.length >= b.href.length ? a : b));
  return longest.href === href;
}

function SidebarNav({
  items,
  pathname,
  onNavigate,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  const { has } = usePermission();
  const visible = items.filter((it) => !it.permission || has(it.permission));
  return (
    <>
      {visible.map((item) => {
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            title={collapsed ? item.name : undefined}
            className={`app-nav-item ${active ? 'active' : ''} ${collapsed ? 'justify-center !px-0' : ''}`}
          >
            <item.icon className="app-nav-icon shrink-0" strokeWidth={1.75} />
            {!collapsed && item.name}
          </Link>
        );
      })}
    </>
  );
}

function SidebarContents({
  pathname,
  userDisplay,
  user,
  onNavigate,
  collapsed,
  onToggle,
}: {
  pathname: string;
  userDisplay: string;
  user: UserInfo | null;
  onNavigate?: () => void;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  return (
    <>
      {/* Logo + toggle */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-4 border-b border-[rgba(255,255,255,0.07)]">
          <span className="text-[11px] font-black tracking-widest text-[var(--surface2)] uppercase select-none">需</span>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title="展开菜单"
              className="app-topbar-btn !text-[rgba(255,255,255,0.35)] hover:!text-[rgba(255,255,255,0.75)] p-1"
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="app-sidebar-logo flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="app-sidebar-mark">需求管理平台</div>
            <div className="app-sidebar-sub">WMS · 安智储</div>
          </div>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title="收起菜单"
              className="app-topbar-btn !text-[rgba(255,255,255,0.35)] hover:!text-[rgba(255,255,255,0.75)] p-1 shrink-0 mt-0.5 -mr-1"
            >
              <ChevronLeft size={13} />
            </button>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="app-sidebar-nav" aria-label="主导航">
        {!collapsed && <div className="app-nav-group-label">工作流</div>}
        <SidebarNav items={workflowNav} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        {!collapsed && <div className="app-nav-group-label">资源</div>}
        <SidebarNav items={resourceNav} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
        {!collapsed && <div className="app-nav-group-label">管理</div>}
        <SidebarNav items={managementNav} pathname={pathname} onNavigate={onNavigate} collapsed={collapsed} />
      </nav>

      {/* User info */}
      {!collapsed && (
        <div className="app-sidebar-user">
          <div className="app-sidebar-user-name">{userDisplay}</div>
          <div className="app-sidebar-user-role">
            {user ? `${roleLabel(user.role)}${user.groupName ? ` · ${user.groupName}` : ''}` : '未登录'}
          </div>
        </div>
      )}
    </>
  );
}

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [user, setUser] = useState(authStore.currentUser);
  const [userLoading, setUserLoading] = useState(true);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    if (userDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userDropdownOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/', { replace: true });
      return;
    }
    authStore.fetchUser().then((u) => {
      setUser(u);
      setUserLoading(false);
      if (!u) {
        navigate('/', { replace: true });
        return;
      }
      // 已登录后再拉权限（auth 走完，token 必定有）
      permissionStore.fetch().catch(() => {});
    });
  }, [navigate]);

  const userDisplay = userLoading ? '...' : user?.displayName ?? '未登录';
  const currentNavItem = allNav.find((item) => isNavActive(location.pathname, item.href));
  const pageTitle = currentNavItem?.name ?? '工作台';

  const sidebarWidth = collapsed ? 52 : 210;

  return (
    <div className="app-layout flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className="app-sidebar hidden lg:flex"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          transition: 'width 0.2s ease, min-width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        <SidebarContents
          pathname={location.pathname}
          userDisplay={userDisplay}
          user={user}
          onNavigate={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
        />
      </aside>

      {/* Mobile sidebar overlay — always expanded */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-[rgba(20,20,19,0.55)] lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -220 }}
              animate={{ x: 0 }}
              exit={{ x: -220 }}
              transition={{ duration: 0.2 }}
              className="app-sidebar fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <SidebarContents
                pathname={location.pathname}
                userDisplay={userDisplay}
                user={user}
                onNavigate={() => setMobileOpen(false)}
                collapsed={false}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="app-topbar shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden app-topbar-btn p-1"
              aria-label={mobileOpen ? '关闭菜单' : '打开菜单'}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="app-page-title">{pageTitle}</span>
          </div>

          <div className="app-topbar-actions">
            <NotificationBell variant="topbar" />
            <div className="relative hidden sm:block" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setUserDropdownOpen((o) => !o)}
                className="app-topbar-btn"
              >
                <User size={14} className="opacity-70" />
                <span className="max-w-[120px] truncate">{userDisplay}</span>
                <ChevronDown size={12} className={`opacity-50 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {userDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 w-64 border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.12)] overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-[var(--border)]">
                      <p className="text-[14px] font-semibold text-[var(--ink)]">{userDisplay}</p>
                      {user && (
                        <div className="mt-1.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted-80)]">
                            <Shield size={11} className="opacity-60" />
                            <span>角色: {roleLabel(user.role)}</span>
                          </div>
                          {user.groupName && (
                            <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-muted-80)]">
                              <UsersRound size={11} className="opacity-60" />
                              <span>组: {user.groupName}</span>
                            </div>
                          )}
                          <div className="text-[12px] text-[var(--ink-muted-80)] font-mono">
                            @{user.username}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="py-1">
                      <Link
                        to="/app/help"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[var(--ink-muted-80)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] transition-colors"
                      >
                        <BookText size={14} />
                        帮助中心
                      </Link>
                    </div>

                    <div className="border-t border-[var(--border)] py-1">
                      <button
                        type="button"
                        onClick={() => authStore.logout()}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-[13px] text-[var(--red)] hover:bg-[rgba(139,58,58,0.06)] transition-colors"
                      >
                        <LogOut size={14} />
                        退出登录
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={() => authStore.logout()}
              className="sm:hidden app-topbar-btn"
              title="退出登录"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="app-main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
