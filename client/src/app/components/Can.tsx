// 按钮/行级权限控制组件 — ready=false 时不渲染（避免闪烁）
import type { ReactNode } from 'react';
import { usePermission } from '../hooks/usePermission';

export interface CanProps {
  /** 单个权限码 */
  permission?: string;
  /** 任一命中即可 */
  anyOf?: string[];
  /** 全部命中 */
  allOf?: string[];
  /** 无权限时渲染 fallback（默认 null，不渲染） */
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, anyOf, allOf, fallback = null, children }: CanProps) {
  const { has, hasAny, hasAll, ready } = usePermission();

  // 未 ready 时不渲染（避免首屏权限闪烁）
  if (!ready) return <>{fallback}</>;

  if (permission && !has(permission)) return <>{fallback}</>;
  if (anyOf && anyOf.length > 0 && !hasAny(...anyOf)) return <>{fallback}</>;
  if (allOf && allOf.length > 0 && !hasAll(...allOf)) return <>{fallback}</>;

  return <>{children}</>;
}
