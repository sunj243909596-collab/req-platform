import { useState } from 'react';
import { Link } from 'react-router';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthBrandPanel, AuthMobileLogo } from '../components/AuthBrandPanel';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setEmailSent(true);
      toast.success('重置链接已发送到您的邮箱');
    }, 1500);
  };

  return (
    <div className="auth-layout">
      <AuthBrandPanel
        title="找回账号访问权限"
        description="输入注册邮箱，我们将发送密码重置链接"
      />

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <AuthMobileLogo />

          <Link to="/login" className="inline-flex items-center gap-2 auth-link mb-6">
            <ArrowLeft size={14} />
            返回登录
          </Link>

          {!emailSent ? (
            <>
              <h2 className="auth-form-title">忘记密码？</h2>
              <p className="auth-form-subtitle">输入您的邮箱地址，我们将发送重置链接</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block mb-2">邮箱地址</label>
                  <div className="auth-input-wrap">
                    <Mail size={16} className="auth-input-icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      className="auth-input"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn-primary justify-center py-2.5"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[var(--surface2)] border-t-transparent rounded-full animate-spin" />
                      发送中...
                    </>
                  ) : (
                    '发送重置链接'
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-5 bg-[rgba(120,140,93,0.12)] border border-[rgba(120,140,93,0.25)] flex items-center justify-center">
                <CheckCircle2 size={28} className="text-[var(--olive)]" />
              </div>

              <h2 className="auth-form-title">邮件已发送</h2>
              <p className="text-[13px] text-[var(--mid)] mb-6 leading-relaxed">
                我们已向 <span className="font-semibold text-[var(--text)]">{email}</span> 发送了密码重置链接。
                <br />
                请查收邮件并按照说明操作。
              </p>

              <div className="p-3 bg-[var(--surface)] border border-[var(--border)] mb-6 text-left">
                <p className="text-[12px] text-[var(--mid)]">
                  如果几分钟内没有收到邮件，请检查垃圾邮件文件夹
                </p>
              </div>

              <Link to="/login" className="btn-secondary inline-flex w-full justify-center py-2.5">
                返回登录
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
