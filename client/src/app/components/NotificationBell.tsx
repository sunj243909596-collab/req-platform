import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Trash2, Loader2, FileText, MessageSquare, ArrowRight, Send } from 'lucide-react';
import { Link } from 'react-router';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  NOTIFICATION_TYPE_LABELS,
  type Notification,
} from '../../api/notifications';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  ASSIGNED: <ArrowRight size={16} />,
  STATUS_CHANGED: <FileText size={16} />,
  COMMENTED: <MessageSquare size={16} />,
  MENTIONED: <MessageSquare size={16} />,
  REVIEW_SUBMITTED: <Send size={16} />,
  REVIEW_RESULT: <Check size={16} />,
  RELEASE_REVIEW: <CheckCheck size={16} />,
};

type NotificationBellProps = {
  variant?: 'topbar' | 'dark';
};

export function NotificationBell({ variant = 'dark' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  const fetchData = async () => {
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(30),
        getUnreadCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch {
      // silently fail
    }
  };

  // Poll every 30s for new notifications
  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 30000);
    return () => clearInterval(pollRef.current ?? undefined);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => { setOpen(!open); if (!open) fetchData(); }}
        className={
          variant === 'topbar'
            ? 'app-topbar-btn relative'
            : 'p-2 rounded-[var(--radius-sm)] text-white/72 hover:text-white hover:bg-white/10 transition-colors relative'
        }
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-[var(--destructive)] text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-12 w-[400px] max-h-[500px] bg-[var(--surface)] border border-[var(--border)] shadow-[0_24px_60px_rgba(0,0,0,0.12)] overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg)]">
            <h3 className="font-semibold text-[var(--ink)]">通知</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-[var(--clay)] hover:underline"
              >
                <CheckCheck size={14} /> 全部已读
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-[var(--clay)]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 text-[var(--ink-muted-80)] text-sm">
                暂无通知
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] transition-colors ${
                    !n.isRead ? 'bg-[var(--bg)]' : ''
                  }`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-full ${
                    !n.isRead ? 'bg-[rgba(217,119,87,0.12)] text-[var(--clay)]' : 'text-[var(--ink-muted-48)]'
                  }`}>
                    {TYPE_ICONS[n.type] || <Bell size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[var(--clay)]">
                        {NOTIFICATION_TYPE_LABELS[n.type] || n.type}
                      </span>
                      {!n.isRead && (
                        <span className="w-2 h-2 bg-[var(--clay)] rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-[var(--ink)] truncate">{n.content}</p>
                    <span className="text-xs text-[var(--ink-muted-80)]">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1 text-[var(--ink-muted-48)] hover:text-[var(--clay)] rounded transition-colors"
                        title="标记已读"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    {n.reqId && (
                      <Link
                        to={`/app/requirements/${n.reqId}`}
                        onClick={() => setOpen(false)}
                        className="p-1 text-[var(--ink-muted-48)] hover:text-[var(--clay)] rounded transition-colors"
                        title="查看需求"
                      >
                        <FileText size={14} />
                      </Link>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      className="p-1 text-[var(--ink-muted-48)] hover:text-[var(--destructive)] rounded transition-colors"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[var(--border)] text-center">
            <span className="text-xs text-[var(--ink-muted-80)]">
              每30秒自动刷新
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
