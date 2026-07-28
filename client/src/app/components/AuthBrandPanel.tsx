import type { ReactNode } from 'react';
import { motion } from 'motion/react';

type AuthBrandPanelProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function AuthBrandPanel({ title, description, children }: AuthBrandPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="auth-brand"
    >
      {/* Subtle brand gradient — no stock photo / pulse orbs */}
      <div className="absolute inset-0 bg-[var(--dark)]" />
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 20% 20%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, rgba(37,99,235,0.18), transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="auth-brand-inner">
        <div>
          <div className="auth-brand-mark">需求管理平台</div>
          <div className="auth-brand-sub">WMS · 安智储</div>
        </div>

        <div className="max-w-md">
          <h1 className="auth-brand-title">{title}</h1>
          {description && <p className="auth-brand-desc">{description}</p>}
          {children}
        </div>

        <div className="auth-brand-footer">
          <p>© 2026 国药物流·WMS&amp;巴枪·需求管理平台</p>
        </div>
      </div>
    </motion.div>
  );
}

export function AuthMobileLogo() {
  return (
    <div className="auth-mobile-logo lg:hidden">
      <div className="auth-mobile-mark">需求管理平台</div>
      <p className="text-[12px] text-[var(--mid)] mt-1">WMS · 安智储</p>
    </div>
  );
}
