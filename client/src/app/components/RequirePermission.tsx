// 路由级权限守卫 — ready=false 显示 spinner；无权限跳回 /app
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { usePermission } from '../hooks/usePermission';

export interface RequirePermissionProps {
  /** 单个权限码 */
  permission?: string;
  /** 任一命中即可 */
  anyOf?: string[];
  /** 全部命中 */
  allOf?: string[];
  children: ReactNode;
}

export function RequirePermission({ permission, anyOf, allOf, children }: RequirePermissionProps) {
  const { has, hasAny, hasAll, ready } = usePermission();

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          加载中…
        </div>
      </div>
    );
  }

  if (permission && !has(permission)) return <Navigate to="/app" replace />;
  if (anyOf && anyOf.length > 0 && !hasAny(...anyOf)) return <Navigate to="/app" replace />;
  if (allOf && allOf.length > 0 && !hasAll(...allOf)) return <Navigate to="/app" replace />;

  return <>{children}</>;
}
