import type { ReactNode } from 'react';
import { PageTransition } from './PageTransition';

type AppPageShellProps = {
  children: ReactNode;
  /** 默认 1400px */
  maxWidth?: '1200px' | '1400px' | 'full';
  className?: string;
};

const maxWidthClass = {
  '1200px': 'max-w-[1200px]',
  '1400px': 'max-w-[1400px]',
  full: 'max-w-none',
};

export function AppPageShell({
  children,
  maxWidth = '1400px',
  className = '',
}: AppPageShellProps) {
  return (
    <PageTransition>
      <div className={`app-page-shell ${className}`}>
        <div className={`${maxWidthClass[maxWidth]} mx-auto w-full`}>{children}</div>
      </div>
    </PageTransition>
  );
}
