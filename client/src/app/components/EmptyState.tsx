import { Link } from 'react-router';
import { LucideIcon, FileText } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  actionLabel?: string;
  actionTo?: string;
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  action,
  actionLabel,
  actionTo,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 mb-6 bg-[var(--canvas-parchment)] rounded-full flex items-center justify-center">
        <Icon size={40} className="text-[var(--ink-muted-48)]" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-[var(--ink)]">{title}</h3>
      {description && <p className="text-[var(--ink-muted-80)] max-w-md mb-6">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
        >
          {action.label}
        </button>
      )}
      {!action && actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 inline-block"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
