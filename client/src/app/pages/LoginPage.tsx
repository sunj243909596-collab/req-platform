import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { login, isAuthenticated } from '../../api/auth';
import { AuthBrandPanel, AuthMobileLogo } from '../components/AuthBrandPanel';

const STORAGE_KEY_USERNAME = 'saved_username';
const STORAGE_KEY_PASSWORD = 'saved_password';

export function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/app/requirements', { replace: true });
      return;
    }
    const savedUsername = localStorage.getItem(STORAGE_KEY_USERNAME);
    const savedPassword = localStorage.getItem(STORAGE_KEY_PASSWORD);
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
    if (savedPassword) {
      setPassword(savedPassword);
      setRememberPassword(true);
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('请输入用户名和密码');
      return;
    }

    setIsLoading(true);
    try {
      await login({ username: username.trim(), password });
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY_USERNAME, username.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY_USERNAME);
      }
      if (rememberPassword) {
        localStorage.setItem(STORAGE_KEY_PASSWORD, password);
      } else {
        localStorage.removeItem(STORAGE_KEY_PASSWORD);
      }
      toast.success('登录成功');
      navigate('/app/requirements', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <AuthBrandPanel
        title="让需求管理更智能、更高效"
        description="智能 AI 助手分析需求 · 实时团队协作 · 完整发版管理流程"
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="auth-form-panel"
      >
        <div className="auth-form-card">
          <AuthMobileLogo />

          <h2 className="auth-form-title">欢迎回来</h2>
          <p className="auth-form-subtitle">登录您的账号以继续</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block mb-2">用户名</label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  required
                  autoFocus
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
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

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none normal-case tracking-normal font-normal text-[12px] text-[var(--mid)]">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => {
                      setRememberMe(e.target.checked);
                      if (!e.target.checked) setRememberPassword(false);
                    }}
                    className="w-3.5 h-3.5 border-[var(--border)] accent-[var(--dark)] cursor-pointer"
                  />
                  记住我
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none normal-case tracking-normal font-normal text-[12px] text-[var(--mid)]">
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(e) => {
                      setRememberPassword(e.target.checked);
                      if (e.target.checked) setRememberMe(true);
                    }}
                    className="w-3.5 h-3.5 border-[var(--border)] accent-[var(--dark)] cursor-pointer"
                  />
                  记住密码
                </label>
              </div>
              <Link to="/forgot-password" className="auth-link">
                忘记密码？
              </Link>
            </div>

            <motion.button
              type="submit"
              disabled={isLoading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full btn-primary justify-center py-2.5"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-[var(--surface2)] border-t-transparent rounded-full animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight size={16} />
                </>
              )}
            </motion.button>
          </form>

          <p className="mt-6 text-center text-[12px] text-[var(--mid)]">
            还没有账号？{' '}
            <Link to="/register" className="auth-link">
              立即注册
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
