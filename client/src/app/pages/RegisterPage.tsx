import { useState } from 'react';
import { Link } from 'react-router';
import { Eye, EyeOff, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AuthBrandPanel, AuthMobileLogo } from '../components/AuthBrandPanel';

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('密码长度不能少于6个字符');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      toast.info('注册功能暂未开放，请联系管理员创建账号');
    }, 1000);
  };

  return (
    <div className="auth-layout">
      <AuthBrandPanel
        title="团队协作，需求可追溯"
        description="统一管理需求、发版与知识库，让交付过程更清晰"
      />

      <div className="auth-form-panel">
        <div className="auth-form-card">
          <AuthMobileLogo />

          <h2 className="auth-form-title">创建账号</h2>
          <p className="auth-form-subtitle">填写信息即可开始使用</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-2">姓名</label>
              <div className="auth-input-wrap">
                <UserIcon size={16} className="auth-input-icon" />
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="张三"
                  required
                  className="auth-input"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2">用户名</label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="请输入用户名"
                  required
                  className="auth-input"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2">密码</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="至少6个字符"
                  required
                  minLength={6}
                  className="auth-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle)] hover:text-[var(--text)] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block mb-2">确认密码</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="再次输入密码"
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
                  注册中...
                </>
              ) : (
                <>
                  创建账号
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-[var(--mid)]">
            已有账号？{' '}
            <Link to="/login" className="auth-link">
              立即登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
