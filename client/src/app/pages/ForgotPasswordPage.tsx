import { Link } from 'react-router';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { AuthBrandPanel, AuthMobileLogo } from '../components/AuthBrandPanel';

/**
 * v1.0.0 起，忘记密码页面回到"暂未实现真实邮件流程"提示。
 * 后续 v1.1 再接入后端 POST /api/v1/auth/forgot-password 真链路。
 *
 * 当前用户恢复账号访问的方式：
 *   1) 联系 ADMIN 在「团队管理 → 用户」中重置密码
 *   2) 登录后用「头像 → 修改密码」自助修改
 */
export function ForgotPasswordPage() {
  return (
    <div className="auth-layout">
      <AuthBrandPanel
        title="找回账号访问权限"
        description="v1.1 邮件找回功能正在升级，当前请用以下两种方式恢复"
      />

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <AuthMobileLogo />

          <Link to="/login" className="inline-flex items-center gap-2 auth-link mb-6">
            <ArrowLeft size={14} />
            返回登录
          </Link>

          <h2 className="auth-form-title">忘记密码？</h2>
          <p className="auth-form-subtitle">
            邮件找回功能正在升级（计划 v1.1 上线）。<br />
            当前请使用下列任一方式恢复账号访问：
          </p>

          <ol className="mt-5 space-y-4 text-left">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--canvas-parchment)] border border-[var(--hairline)] flex items-center justify-center text-sm font-semibold text-[var(--ink)]">1</span>
              <div className="text-sm text-[var(--ink)]">
                <p className="font-medium flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-[var(--olive)]" />
                  联系管理员重置
                </p>
                <p className="text-[var(--ink-muted-80)] mt-1">
                  让 ADMIN 在「团队管理 → 用户管理 → 编辑」处直接重置你的密码。
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--canvas-parchment)] border border-[var(--hairline)] flex items-center justify-center text-sm font-semibold text-[var(--ink)]">2</span>
              <div className="text-sm text-[var(--ink)]">
                <p className="font-medium flex items-center gap-1.5">
                  <KeyRound size={14} className="text-[var(--olive)]" />
                  登录后自助修改
                </p>
                <p className="text-[var(--ink-muted-80)] mt-1">
                  仍记得旧密码时，登录后点击右上角头像 → 修改密码。
                </p>
              </div>
            </li>
          </ol>

          <div className="mt-8 pt-6 border-t border-[var(--hairline)]">
            <Link
              to="/login"
              className="btn-secondary inline-flex w-full justify-center py-2.5"
            >
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
