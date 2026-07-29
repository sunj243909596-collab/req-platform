import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KeyRound, X, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { changeMyPassword } from '../../api/users';

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

/** 视觉强度评分（与后端 validatePassword 一致，仅前端即时反馈） */
function strengthScore(p: string): number {
  let n = 0;
  if (p.length >= 8) n += 1;
  if (/[A-Z]/.test(p)) n += 1;
  if (/[a-z]/.test(p)) n += 1;
  if (/[0-9]/.test(p)) n += 1;
  if (/[^A-Za-z0-9]/.test(p)) n += 1;
  return n;
}

function strengthLabel(n: number, len: number): { text: string; color: string } {
  if (len === 0) return { text: '—', color: 'var(--ink-muted-80)' };
  if (n <= 1) return { text: '弱', color: 'var(--red)' };
  if (n <= 3) return { text: '中', color: '#ff9500' };
  return { text: '强', color: 'var(--olive)' };
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [cf, setCf] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const [curErr, setCurErr] = useState<string | null>(null);
  const [npErr, setNpErr] = useState<string | null>(null);
  const [cfErr, setCfErr] = useState<string | null>(null);

  // 关闭 / 重开时清空字段
  useEffect(() => {
    if (!open) {
      setCur('');
      setNp('');
      setCf('');
      setShow(false);
      setBusy(false);
      setCurErr(null);
      setNpErr(null);
      setCfErr(null);
    }
  }, [open]);

  const score = strengthScore(np);
  const { text: strengthTxt, color: strengthColor } = strengthLabel(score, np.length);

  const submit = async () => {
    setCurErr(null);
    setNpErr(null);
    setCfErr(null);

    if (!cur) { setCurErr('请输入当前密码'); return; }
    if (!np) { setNpErr('请输入新密码'); return; }
    if (!cf) { setCfErr('请再次输入新密码'); return; }
    if (np !== cf) { setCfErr('两次输入的新密码不一致'); return; }
    if (np === cur) { setNpErr('新密码不能与当前密码相同'); return; }
    if (score < 4) {
      setNpErr('密码需 ≥ 8 位且包含大小写字母与数字（建议加特殊字符）');
      return;
    }

    setBusy(true);
    try {
      await changeMyPassword({
        currentPassword: cur,
        newPassword: np,
        confirmPassword: cf,
      });
      toast.success('密码已修改，请重新登录');
      onOpenChange(false);
      // 1.5s 后强制清 token + 跳登录（旧 token 因 tokenVersion 不匹配自然失效，此举只是立刻回到登录态）
      window.setTimeout(() => {
        try { localStorage.removeItem('token'); } catch { /* noop */ }
        navigate('/login', { replace: true });
      }, 1500);
    } catch (e: unknown) {
      // 解析后端 { errorCode, field, error }
      const err = e as { response?: { data?: { errorCode?: string; field?: string; error?: string } }; message?: string };
      const code = err?.response?.data?.errorCode;
      const field = err?.response?.data?.field;
      const msg = err?.response?.data?.error ?? err?.message ?? '修改失败';

      if (code === 'TOKEN_REVOKED' || code === 'INVALID_TOKEN' || code === 'USER_DISABLED') {
        // 后端已用 tokenVersion 把我打下来了 → 清 token 跳登录
        try { localStorage.removeItem('token'); } catch { /* noop */ }
        toast.error(msg);
        navigate('/login', { replace: true });
        return;
      }

      if (field === 'currentPassword' || code === 'OLD_PASSWORD_MISMATCH') setCurErr(msg);
      else if (field === 'newPassword' || code === 'WEAK_PASSWORD' || code === 'PASSWORD_UNCHANGED') setNpErr(msg);
      else if (field === 'confirmPassword' || code === 'CONFIRM_MISMATCH') setCfErr(msg);
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={close}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[var(--canvas)] rounded-[var(--radius-lg)] shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
            >
              <div className="p-6 border-b border-[var(--hairline)] flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(120,140,93,0.15)' }}
                >
                  <KeyRound size={22} style={{ color: 'var(--olive)' }} />
                </div>
                <div className="flex-1">
                  <h3 id="change-password-title" className="text-[var(--ink)] mb-1">修改密码</h3>
                  <p className="text-sm text-[var(--ink-muted-80)]">
                    修改成功后会立即登出，请用新密码重新登录
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="p-2 hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-sm)] transition-colors"
                  aria-label="关闭"
                >
                  <X size={20} className="text-[var(--ink-muted-80)]" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <Field
                  label="当前密码"
                  error={curErr}
                  type={show ? 'text' : 'password'}
                  value={cur}
                  autoFocus
                  autoComplete="current-password"
                  onChange={(v) => { setCur(v); setCurErr(null); }}
                />

                <div>
                  <Field
                    label="新密码"
                    error={npErr}
                    hint="≥ 8 位，必须包含大小写字母与数字"
                    type={show ? 'text' : 'password'}
                    value={np}
                    autoComplete="new-password"
                    onChange={(v) => { setNp(v); setNpErr(null); }}
                  />
                  {np.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex gap-1 flex-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="h-1.5 flex-1 rounded-full transition-colors"
                            style={{
                              backgroundColor: i < score ? strengthColor : 'var(--canvas-parchment)',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-medium w-6 text-right" style={{ color: strengthColor }}>
                        {strengthTxt}
                      </span>
                    </div>
                  )}
                </div>

                <Field
                  label="确认新密码"
                  error={cfErr}
                  type={show ? 'text' : 'password'}
                  value={cf}
                  autoComplete="new-password"
                  onChange={(v) => { setCf(v); setCfErr(null); }}
                />

                <label className="flex items-center gap-2 text-sm text-[var(--ink-muted-80)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={show}
                    onChange={() => setShow((v) => !v)}
                    className="cursor-pointer"
                  />
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  显示密码（纯本地切换，不存储）
                </label>
              </div>

              <div className="p-6 pt-2 flex items-center justify-end gap-3 border-t border-[var(--hairline)]">
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  className="px-5 py-2.5 bg-[var(--canvas-parchment)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || !cur || !np || !cf}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-[var(--radius-pill)] hover:opacity-90 transition-all active:scale-95 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--olive)' }}
                >
                  {busy && <Loader2 className="animate-spin" size={16} />}
                  <ShieldCheck size={16} />
                  保存修改
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

interface FieldProps {
  label: string;
  value: string;
  type: string;
  error: string | null;
  hint?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onChange: (v: string) => void;
}

function Field({ label, value, type, error, hint, autoComplete, autoFocus, onChange }: FieldProps) {
  return (
    <div>
      <label className="block mb-1.5 text-sm font-medium text-[var(--ink)]">{label}</label>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-[var(--canvas-parchment)] border rounded-[var(--radius-md)] outline-none focus:border-[var(--olive)] transition-colors text-[var(--ink)]"
        style={{
          borderColor: error ? 'var(--red)' : 'var(--border)',
        }}
      />
      {error ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--ink-muted-80)]">{hint}</p>
      ) : null}
    </div>
  );
}
