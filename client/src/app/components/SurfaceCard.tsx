import type { ReactNode, CSSProperties } from 'react';

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  style?: CSSProperties;
  onClick?: () => void;
};

const paddingClass = {
  none: '',
  sm: 'p-3',
  md: 'p-3 sm:p-4',
  lg: 'p-4 sm:p-5',
};

export function SurfaceCard({
  children,
  className = '',
  padding = 'md',
  hover = false,
  style,
  onClick,
}: SurfaceCardProps) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={style}
      className={`
        surface-card
        ${paddingClass[padding]} ${hover ? 'surface-card-hover' : ''}
        ${onClick ? 'text-left w-full cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </Tag>
  );
}
