import type { ReactNode } from 'react';
import { Breadcrumb } from './Breadcrumb';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  showBreadcrumb?: boolean;
};

export function PageHeader({
  description,
  actions,
  showBreadcrumb = true,
}: PageHeaderProps) {
  const hasContent = description || actions;
  return (
    <header className="mb-4">
      {showBreadcrumb && <Breadcrumb />}
      {hasContent && (
        <div className="flex items-center justify-between gap-4">
          {description && (
            <p className="app-page-subtitle leading-snug truncate hidden sm:block">{description}</p>
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
    </header>
  );
}
