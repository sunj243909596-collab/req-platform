import { useState, useEffect, useCallback } from 'react';
import { Loader2, Hash, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  getNumberRule,
  updateNumberRule,
  listSeqCounters,
  type RequirementNumberRule,
  type RequirementSeqCounterItem,
} from '../../../api/number-rule';
import { authStore } from '../../../stores/auth';

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

const PREFIX_RE = /^[A-Z][A-Z0-9]{0,9}$/;

type NumberRuleSettingsProps = {
  reqType: string;
  title: string;
};

export function NumberRuleSettings({ reqType, title }: NumberRuleSettingsProps) {
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';

  const [savedEnabled, setSavedEnabled] = useState(false);
  const [savedPrefix, setSavedPrefix] = useState('REQ');
  const [counters, setCounters] = useState<RequirementSeqCounterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [countersLoading, setCountersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftPrefix, setDraftPrefix] = useState('REQ');

  const applyRule = useCallback((r: RequirementNumberRule) => {
    const enabled = Boolean(r.enabled);
    const prefix = r.prefix || 'REQ';
    setSavedEnabled(enabled);
    setSavedPrefix(prefix);
    setDraftEnabled(enabled);
    setDraftPrefix(prefix);
  }, []);

  const loadCounters = useCallback(async () => {
    setCountersLoading(true);
    try {
      setCounters(await listSeqCounters(reqType));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '计数桶加载失败');
    } finally {
      setCountersLoading(false);
    }
  }, [reqType]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getNumberRule(reqType);
      applyRule(r);
      void loadCounters();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '规则加载失败');
    } finally {
      setLoading(false);
    }
  }, [applyRule, loadCounters, reqType]);

  useEffect(() => {
    void load();
  }, [load]);

  const prefixDirty = draftPrefix !== savedPrefix;
  const prefixValid = PREFIX_RE.test(draftPrefix);

  const persistRule = async (
    next: { enabled: boolean; prefix: string },
    successMsg: string
  ): Promise<boolean> => {
    if (!PREFIX_RE.test(next.prefix)) {
      toast.error('前缀必须是大写字母+数字，长度 1-10');
      return false;
    }
    setSaving(true);
    try {
      const updated = await updateNumberRule(reqType, next);
      applyRule(updated);
      await loadCounters();
      toast.success(successMsg);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleEnabledChange = async (checked: boolean) => {
    setDraftEnabled(checked);
    if (!isAdmin) return;
    const ok = await persistRule(
      { enabled: checked, prefix: draftPrefix },
      checked ? '已启用自定义编码规则' : '已关闭自定义编码规则'
    );
    if (!ok) setDraftEnabled(savedEnabled);
  };

  const handleSavePrefix = async () => {
    if (!prefixDirty) return;
    const ok = await persistRule(
      { enabled: draftEnabled, prefix: draftPrefix },
      '前缀已保存'
    );
    if (!ok) setDraftPrefix(savedPrefix);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-[var(--ink)]">{title}</h3>
        <p className="text-[12px] text-[var(--ink-muted-80)] mt-1">
          仅作用于「{title.replace(/编码$/, '')}」类型。编码格式
          <code className="font-mono mx-1">{draftPrefix || 'HD'}-&lt;一级模块&gt;-&lt;二级模块&gt;-&lt;类型首字母&gt;-&lt;seq&gt;</code>
          （例 HD-RM-1001-R-001）。计数按该类型下选中分类独立。
        </p>
      </div>

      <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] p-4 mb-4 space-y-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draftEnabled}
              onChange={(e) => void handleEnabledChange(e.target.checked)}
              disabled={!isAdmin || saving}
              className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] disabled:cursor-not-allowed"
            />
            <span className="text-[13px] text-[var(--ink)] font-medium">启用自定义编码规则</span>
          </label>
          {draftEnabled ? (
            <span className="text-[11px] px-2 py-0.5 bg-success/10 text-success rounded-[1px]">已启用</span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 bg-[var(--ink-muted-48)]/20 text-[var(--ink-muted-80)] rounded-[1px]">未启用</span>
          )}
        </div>

        <div>
          <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">项目前缀（第 1 段）</label>
          <div className="flex items-center gap-2">
            <Hash size={14} className="text-[var(--ink-muted-48)]" />
            <input
              type="text"
              value={draftPrefix}
              onChange={(e) => setDraftPrefix(e.target.value.toUpperCase())}
              disabled={!isAdmin}
              placeholder="HD"
              maxLength={10}
              className="w-32 px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] font-mono disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
            <span className="text-[11px] text-[var(--ink-muted-80)]">
              {prefixValid ? '大写字母+数字，1-10 字符' : '格式错误'}
            </span>
          </div>
        </div>

        {isAdmin ? (
          <div className="flex items-center justify-between pt-2 gap-3">
            <p className="text-[11px] text-[var(--ink-muted-80)]">
              {saving
                ? '保存中…'
                : prefixDirty
                  ? '前缀有未保存的更改'
                  : savedEnabled
                    ? '规则已启用（开关即时保存）'
                    : '规则未启用（勾选开关即可启用）'}
            </p>
            <button
              type="button"
              onClick={() => void handleSavePrefix()}
              disabled={!prefixDirty || !prefixValid || saving}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white text-[13px] rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              保存前缀
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--ink-muted-80)] pt-2">仅管理员可修改编码规则</p>
        )}
      </div>

      <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] p-4 mb-4 bg-[var(--canvas-parchment)]">
        <p className="text-[12px] text-[var(--ink-muted-80)] mb-2">完整编码格式：</p>
        <code className="text-[14px] font-mono text-[var(--ink)]">
          {draftEnabled ? (
            <>{draftPrefix || 'XX'}-&lt;一级模块code&gt;-&lt;二级模块code&gt;-&lt;类型首字母&gt;-&lt;seq&gt;</>
          ) : (
            <>REQ-2026-001（旧格式）</>
          )}
        </code>
        <p className="text-[11px] text-[var(--ink-muted-80)] mt-2">
          示例：<span className="font-mono">{draftEnabled ? `${draftPrefix || 'HD'}-RM-1001-F-001` : 'REQ-2026-001'}</span>
        </p>
      </div>

      <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden mb-4">
        <div className="px-4 py-2.5 bg-[var(--canvas-parchment)] border-b border-[var(--hairline)] flex items-center justify-between gap-2">
          <p className="text-[12px] text-[var(--ink-muted-80)]">
            计数桶（按分类 + 类型独立，每桶 seq 上限 3573）
          </p>
          {countersLoading && <Loader2 size={14} className="animate-spin text-[var(--ink-muted-80)]" />}
        </div>
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">编码前缀</th>
              <th className="px-3 py-2 text-left font-medium">分类路径</th>
              <th className="px-3 py-2 text-left font-medium">需求类型</th>
              <th className="px-3 py-2 text-right font-medium">已用</th>
              <th className="px-3 py-2 text-right font-medium">下次</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {counters.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-[var(--ink-muted-80)]">
                  暂无计数记录（创建或导入需求后自动生成）
                </td>
              </tr>
            ) : (
              counters.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-3 py-2 font-mono text-[12px] text-[var(--ink)]">{c.segmentKey}</td>
                  <td className="px-3 py-2 text-[12px] text-[var(--ink-muted-80)]">{c.categoryPath}</td>
                  <td className="px-3 py-2">
                    <span>{c.reqTypeName}</span>
                    <span className="ml-1 font-mono text-[11px] text-[var(--ink-muted-80)]">({c.typeLetter})</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-[var(--ink-muted-80)]">{c.currentSeq}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-[var(--primary)] font-semibold">{c.nextSeq}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-[var(--ink-muted-80)] space-y-1 p-3 border border-[var(--hairline)] rounded-[var(--radius-md)]">
        <p>• 选中根分类时子分类 code 为空，编码形如 <code className="font-mono">HD-RM--F-001</code></p>
        <p>• 计数器永不重置（只增不减）；跳号可接受（不重复）</p>
        <p>• Excel 导入按用户填写的编码入库，同时回填对应计数桶</p>
      </div>
    </div>
  );
}
