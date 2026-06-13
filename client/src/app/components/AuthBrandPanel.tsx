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
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8 }}
      className="auth-brand"
    >
      {/* 背景图 + 渐变遮罩 */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1498049860654-af1a5c566876?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920"
          alt="工作空间"
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#141413]/80 to-[#141413]/95" />
      </div>

      {/* 装饰性脉冲圆圈 */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-1/4 -right-1/4 w-96 h-96 bg-[var(--clay)]/20 rounded-full blur-3xl pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-1/4 -left-1/4 w-96 h-96 bg-[var(--dark)]/20 rounded-full blur-3xl pointer-events-none"
      />

      {/* 内容 */}
      <div className="auth-brand-inner">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="auth-brand-mark">需求管理平台</div>
          <div className="auth-brand-sub">WMS · 安智储</div>
        </motion.div>

        <div className="max-w-md">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="auth-brand-title"
          >
            {title}
          </motion.h1>
          {description && (
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="auth-brand-desc"
            >
              {description}
            </motion.p>
          )}
          {children}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="auth-brand-footer"
        >
          <p>© 2026 国药物流·WMS&amp;巴枪·需求管理平台. 保留所有权利. by sunjian</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function AuthMobileLogo() {
  return (
    <div className="auth-mobile-logo lg:hidden">
      <div className="auth-mobile-mark">需求管理平台</div>
      <p className="text-[10px] text-[var(--mid)] tracking-wider mt-1">WMS · 安智储</p>
    </div>
  );
}
