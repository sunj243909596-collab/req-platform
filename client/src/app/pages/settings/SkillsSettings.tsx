import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Power, Loader2, Check,
  Code2, Search, MessageCircle, Database, CalendarClock, FlaskConical, Bot } from 'lucide-react';
import { toast } from 'sonner';
import {
  listSkills, createSkill, updateSkill, deleteSkill, toggleSkill,
  listAssignments, upsertAssignment,
  type AiSkill, type SkillAssignment,
} from '../../../api/skills';

const SKILL_CATEGORIES: Record<string, string> = {
  design: '方案设计',
  analysis: '需求分析',
  chat: '通用对话',
  rag: 'RAG检索',
  planning: '发版规划',
  testing: '测试用例',
  general: '其他',
};

const CATEGORY_COLORS: Record<string, string> = {
  design: '#3b82f6',
  analysis: '#f59e0b',
  chat: '#10b981',
  rag: '#8b5cf6',
  planning: '#f97316',
  testing: '#06b6d4',
  general: '#6b7280',
};

// Per-skill icon mapping; falls back to Bot for unknown names
const SKILL_ICONS: Record<string, React.ElementType> = {
  'wm-architect': Code2,
  'wm-analyst': Search,
  'wm-assistant': MessageCircle,
  'wm-rag': Database,
  'wm-planner': CalendarClock,
  'wm-tester': FlaskConical,
};

const TASK_LABELS: Record<string, string> = {
  generateDesign: 'AI 生成设计方案',
  analyzeRequirement: 'AI 需求分析',
  chat: 'AI 对话助手',
  ragSearch: 'RAG 知识检索',
  estimateReleaseEffort: '发版工作量估算',
  suggestReleaseSchedule: '发版排程建议',
  generateTestCases: '生成测试用例',
};

type FormMode = 'list' | 'edit';
interface SkillForm {
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  category: string;
}

const emptyForm: SkillForm = { name: '', displayName: '', description: '', systemPrompt: '', category: 'general' };

export function SkillsSettings() {
  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [assignments, setAssignments] = useState<SkillAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<FormMode>('list');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      listSkills().catch(() => []),
      listAssignments().catch(() => []),
    ]).then(([s, a]) => {
      setSkills(s);
      setAssignments(a);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setMode('edit');
  };

  const handleEdit = (s: AiSkill) => {
    setEditId(s.id);
    setForm({ name: s.name, displayName: s.displayName, description: s.description || '', systemPrompt: s.systemPrompt, category: s.category });
    setMode('edit');
  };

  const handleCancel = () => {
    setMode('list');
    setEditId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.displayName.trim() || !form.systemPrompt.trim()) {
      toast.error('名称、显示名称和提示词不能为空');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await updateSkill(editId, form);
        toast.success('技能已更新');
      } else {
        await createSkill(form);
        toast.success('技能已创建');
      }
      handleCancel();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: AiSkill) => {
    if (!window.confirm(`确定删除技能「${s.displayName}」吗？`)) return;
    try {
      await deleteSkill(s.id);
      toast.success('技能已删除');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleToggle = async (s: AiSkill) => {
    try {
      await toggleSkill(s.id);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    }
  };

  const handleAssign = async (taskKey: string, skillId: number) => {
    try {
      await upsertAssignment({ taskKey, skillId });
      toast.success(`已更新映射: ${TASK_LABELS[taskKey] || taskKey} → ${skills.find(s => s.id === skillId)?.displayName}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const getAssignedSkillId = (taskKey: string): number | null => {
    const a = assignments.find(x => x.taskKey === taskKey && x.enabled);
    return a?.skillId || null;
  };

  if (mode === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[var(--ink)]">{editId ? '编辑技能' : '创建技能'}</h3>
          <button onClick={handleCancel} className="px-3 py-1.5 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">
            返回列表
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1.5 text-sm text-[var(--ink)]">唯一标识 *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如 wm-architect" disabled={!!editId}
                className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-50" />
              <p className="text-xs text-[var(--ink-muted-48)] mt-1">唯一标识，创建后不可修改</p>
            </div>
            <div>
              <label className="block mb-1.5 text-sm text-[var(--ink)]">显示名称 *</label>
              <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                placeholder="如 WMOS 架构师"
                className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-1.5 text-sm text-[var(--ink)]">描述</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="技能用途描述"
                className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
            </div>
            <div>
              <label className="block mb-1.5 text-sm text-[var(--ink)]">分类</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
                {Object.entries(SKILL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">
              系统提示词模板 *
              <span className="text-[var(--ink-muted-48)] ml-2 font-normal">
                支持占位符：{'{{title}} {{description}} {{background}} {{module}} {{tables}} {{context}}'}
              </span>
            </label>
            <textarea value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              rows={14} placeholder="输入系统提示词模板..."
              className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={handleCancel} className="px-5 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} 保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--primary)]" /></div>
      ) : (
        <>
          {/* Skills List */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[var(--ink)]">技能列表</h3>
              <button onClick={handleCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-colors">
                <Plus size={14} /> 创建技能
              </button>
            </div>

            {skills.length === 0 ? (
              <div className="text-center py-8 text-[var(--ink-muted-80)]">
                <p>暂无 AI 技能，创建预置技能或点击"创建技能"</p>
              </div>
            ) : (
              <div className="space-y-2">
                {skills.map(s => (
                  <div key={s.id} className={`flex items-center gap-4 p-4 rounded-[var(--radius-md)] border ${s.enabled ? 'bg-[var(--canvas-parchment)] border-[var(--hairline)]' : 'bg-[var(--canvas)] border-[var(--hairline)] opacity-60'}`}>
                    {(() => {
                      const Icon = SKILL_ICONS[s.name] ?? Bot;
                      return (
                        <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[s.category] ?? '#6b7280' }}>
                          <Icon size={18} strokeWidth={1.8} />
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--ink)]">{s.displayName}</span>
                        <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink-muted-80)]">{s.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-xs text-white" style={{ backgroundColor: CATEGORY_COLORS[s.category] }}>{SKILL_CATEGORIES[s.category]}</span>
                        {!s.enabled && <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600">已禁用</span>}
                      </div>
                      {s.description && <p className="text-xs text-[var(--ink-muted-80)] mt-0.5 truncate">{s.description}</p>}
                      <p className="text-xs text-[var(--ink-muted-48)] mt-1 truncate font-mono">{s.systemPrompt.slice(0, 100)}...</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggle(s)} title={s.enabled ? '禁用' : '启用'}
                        className={`p-1.5 rounded transition-colors ${s.enabled ? 'text-emerald-500 hover:bg-emerald-50' : 'text-[var(--ink-muted-48)] hover:bg-[var(--canvas)]'}`}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => handleEdit(s)} className="p-1.5 text-[var(--ink-muted-80)] hover:bg-[var(--canvas)] rounded transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(s)} className="p-1.5 text-[var(--destructive)] hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assignment Mapping */}
          <div>
            <h3 className="mb-4 text-[var(--ink)]">AI 调用映射</h3>
            <p className="text-sm text-[var(--ink-muted-80)] mb-4">配置每个 AI 任务使用哪个技能</p>
            <div className="space-y-2">
              {Object.entries(TASK_LABELS).map(([taskKey, label]) => (
                <div key={taskKey} className="flex items-center gap-4 p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)]">
                  <span className="text-sm text-[var(--ink)] font-medium w-40 shrink-0">{label}</span>
                  <span className="text-[var(--ink-muted-48)]">→</span>
                  <select
                    value={getAssignedSkillId(taskKey) || ''}
                    onChange={e => handleAssign(taskKey, parseInt(e.target.value))}
                    className="flex-1 px-3 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">未分配（使用默认提示词）</option>
                    {skills.filter(s => s.enabled).map(s => (
                      <option key={s.id} value={s.id}>{s.displayName} ({s.name})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
