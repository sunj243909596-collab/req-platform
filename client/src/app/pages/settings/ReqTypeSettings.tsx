import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, Loader2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import {
  listAllRequirementTypes,
  createRequirementType,
  updateRequirementType,
  toggleRequirementType,
  deleteRequirementType,
} from '../../../api/req-types';
import type { RequirementTypeItem } from 'shared-types';
import { authStore } from '../../../stores/auth';

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

type FormState = {
  code: string;
  displayName: string;
  color: string;
  prefix: string;
  sortOrder: number;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  code: '',
  displayName: '',
  color: '#6b7280',
  prefix: '',
  sortOrder: 0,
  enabled: true,
};

export function ReqTypeSettings() {
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';

  const [types, setTypes] = useState<RequirementTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RequirementTypeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listAllRequirementTypes();
      setTypes(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, sortOrder: types.length + 1 });
    setCreating(true);
  };

  const openEdit = (t: RequirementTypeItem) => {
    setForm({
      code: t.code,
      displayName: t.displayName,
      color: t.color,
      prefix: t.prefix,
      sortOrder: t.sortOrder,
      enabled: t.enabled,
    });
    setEditing(t);
  };

  // 编辑时，code 仅在无引用时可改（reqType 是需求标签，不影响分类结构）
  const codeLocked = editing
    ? (editing.usageCount?.requirements ?? 0) > 0
    : false;

  const closeModal = () => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.displayName.trim()) {
      toast.error('编码和名称不能为空');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload: Partial<RequirementTypeItem> = {
          displayName: form.displayName,
          color: form.color,
          prefix: form.prefix,
          sortOrder: form.sortOrder,
          enabled: form.enabled,
        };
        if (!codeLocked && form.code !== editing.code) {
          payload.code = form.code;
        }
        await updateRequirementType(editing.id, payload);
        toast.success('已更新');
      } else {
        await createRequirementType({
          code: form.code,
          displayName: form.displayName,
          color: form.color,
          prefix: form.prefix,
          sortOrder: form.sortOrder,
          enabled: form.enabled,
        });
        toast.success('已创建');
      }
      closeModal();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (t: RequirementTypeItem) => {
    try {
      await toggleRequirementType(t.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换失败');
    }
  };

  const handleDelete = async (t: RequirementTypeItem) => {
    if (!window.confirm(`确定要删除需求类型「${t.displayName}」吗？`)) return;
    try {
      await deleteRequirementType(t.id);
      toast.success('已删除');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--ink)]">需求类型</h3>
          <p className="text-[12px] text-[var(--ink-muted-80)] mt-1">
            维护需求/缺陷/改进/任务等业务类型的字典。已启用的类型会出现在下拉框和徽标中。
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--primary)] text-white text-[13px] rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors"
          >
            <Plus size={14} /> 新增类型
          </button>
        )}
      </div>

      <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)]">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium w-12">序</th>
              <th className="px-3 py-2.5 text-left font-medium w-24">编码</th>
              <th className="px-3 py-2.5 text-left font-medium">显示名</th>
              <th className="px-3 py-2.5 text-left font-medium w-28">前缀</th>
              <th className="px-3 py-2.5 text-left font-medium w-20">颜色</th>
              <th className="px-3 py-2.5 text-left font-medium w-20">状态</th>
              {isAdmin && <th className="px-3 py-2.5 text-right font-medium w-32">操作</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--hairline)]">
            {types.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 text-[var(--ink-muted-80)]">
                  暂无数据
                </td>
              </tr>
            ) : (
              types.map((t) => (
                <tr key={t.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-3 py-2.5 text-[var(--ink-muted-80)]">{t.sortOrder}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">{t.code}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[12px] rounded-[1px]"
                      style={{ backgroundColor: t.color + '22', color: t.color }}
                    >
                      {t.displayName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--ink-muted-80)]">
                    {t.prefix || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-4 h-4 rounded-[1px] border border-[var(--hairline)]"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="font-mono text-[11px] text-[var(--ink-muted-80)]">{t.color}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {t.enabled ? (
                      <span className="text-[11px] px-2 py-0.5 bg-success/10 text-success rounded-[1px]">
                        启用
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 bg-[var(--ink-muted-48)]/20 text-[var(--ink-muted-80)] rounded-[1px]">
                        停用
                      </span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="p-1.5 text-[var(--ink-muted-80)] hover:text-[var(--primary)] transition-colors"
                          title="编辑"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(t)}
                          className="px-2 py-0.5 text-[11px] border border-[var(--hairline)] rounded-[1px] hover:bg-[var(--surface-2)] transition-colors"
                          title={t.enabled ? '停用' : '启用'}
                        >
                          {t.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="p-1.5 text-[var(--ink-muted-80)] hover:text-[var(--destructive)] transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div
            className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-[var(--ink)] mb-4">
              {editing ? '编辑需求类型' : '新增需求类型'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">
                  编码 <span className="text-[var(--destructive)]">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  disabled={!!editing && codeLocked}
                  placeholder="REQUIREMENT"
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] font-mono disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
                <p className="text-[11px] text-[var(--ink-muted-80)] mt-1">
                  {editing
                    ? codeLocked
                      ? '已被需求/分类引用，编码不可改'
                      : '未被引用，可修改编码'
                    : '大写字母/数字/下划线'}
                </p>
              </div>

              <div>
                <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">
                  显示名 <span className="text-[var(--destructive)]">*</span>
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  placeholder="需求"
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">
                  标题前缀
                </label>
                <input
                  type="text"
                  value={form.prefix}
                  onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                  placeholder="REQ"
                  maxLength={6}
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-9 w-12 border border-[var(--hairline)] rounded-[1px] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    pattern="^#[0-9a-fA-F]{6}$"
                    className="flex-1 px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">排序</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 0 }))}
                    className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[13px] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[var(--ink-muted-80)] mb-1">状态</label>
                  <label className="flex items-center gap-2 h-[38px]">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                      className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    <span className="text-[13px] text-[var(--ink-muted-80)]">启用</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-[13px] border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--surface-2)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-[13px] bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
