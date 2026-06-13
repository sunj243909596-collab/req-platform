import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit2, X, Loader2, GripVertical,
  Play, Flag, CheckCircle, ArrowRight, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  getWorkflow, updateWorkflowStatuses, updateWorkflowTransitions,
  type WorkflowDefinition, type WorkflowStatus,
} from '../../../api/settings';
import { listGroups, type GroupInfo } from '../../../api/groups';

// ── Color Palette ──

const STATUS_COLORS = [
  '#6c757d', '#17a2b8', '#ffc107', '#0066cc', '#fd7e14',
  '#28a745', '#dc3545', '#6f42c1', '#e83e8c', '#20c997',
];

// ── Types ──

type ViewMode = 'list' | 'editor';

// ── Main Component ──

export function WorkflowDesigner() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [editingWf, setEditingWf] = useState<WorkflowDefinition | null>(null);

  // Create/Edit workflow dialog
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', groupId: 0, enabled: true });
  const [saving, setSaving] = useState(false);

  const loadWorkflows = useCallback(async () => {
    try {
      const data = await listWorkflows();
      setWorkflows(data);
    } catch { toast.error('加载工作流失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadWorkflows();
    listGroups().then(setGroups).catch(() => {});
  }, [loadWorkflows]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('名称不能为空'); return; }
    if (!form.groupId) { toast.error('请选择组'); return; }
    setSaving(true);
    try {
      const wf = await createWorkflow({ name: form.name, description: form.description, groupId: form.groupId });
      toast.success('工作流已创建');
      setShowForm(false);
      setForm({ name: '', description: '', groupId: 0, enabled: true });
      loadWorkflows();
      // Auto-edit
      setEditingWf(wf);
      setViewMode('editor');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const handleToggleEnabled = async (wf: WorkflowDefinition) => {
    try {
      await updateWorkflow(wf.id, { enabled: !wf.enabled });
      loadWorkflows();
      toast.success(wf.enabled ? '已停用' : '已启用');
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除此工作流吗？')) return;
    try {
      await deleteWorkflow(id);
      toast.success('已删除');
      loadWorkflows();
      if (editingWf?.id === id) { setEditingWf(null); setViewMode('list'); }
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleEdit = async (id: number) => {
    try {
      const wf = await getWorkflow(id);
      setEditingWf(wf);
      setViewMode('editor');
    } catch (err) { toast.error((err as Error).message); }
  };

  const handleBack = () => {
    setViewMode('list');
    setEditingWf(null);
    loadWorkflows();
  };

  // ── List View ──
  if (viewMode === 'list') {
    const groupName = (gid: number) => groups.find(g => g.id === gid)?.groupName || '';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[var(--ink)] text-lg font-semibold">工作流管理</h3>
            <p className="text-sm text-[var(--ink-muted-80)] mt-1">管理各组的工作流定义，配置状态和流转规则</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setForm({ name: '', description: '', groupId: 0, enabled: true }); }}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-colors text-sm"
          >
            <Plus size={16} /> 新建工作流
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-[var(--primary)]" /></div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-12 text-[var(--ink-muted-80)]">
            <p className="mb-2">暂无工作流</p>
            <p className="text-xs text-[var(--ink-muted-48)]">创建第一个工作流来定义需求状态流转</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map(wf => (
              <div key={wf.id}
                className="flex items-center justify-between p-4 bg-[var(--canvas)] rounded-[var(--radius-md)] border border-[var(--hairline)] hover:border-[var(--primary)]/30 transition-colors cursor-pointer"
                onClick={() => handleEdit(wf.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-2 h-2 rounded-full ${wf.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--ink)] truncate">{wf.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-[var(--ink-muted-48)]">{groupName(wf.groupId)}</span>
                      <span className="text-xs text-[var(--ink-muted-48)]">{wf._count?.statuses ?? 0} 状态</span>
                      <span className="text-xs text-[var(--ink-muted-48)]">{wf._count?.transitions ?? 0} 流转</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleToggleEnabled(wf)}
                    className={`px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors ${wf.enabled ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    {wf.enabled ? '启用' : '停用'}
                  </button>
                  <button onClick={() => handleDelete(wf.id)}
                    className="p-1.5 text-[var(--ink-muted-60)] hover:text-red-600 rounded-[var(--radius-sm)] hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Workflow Dialog */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-[var(--radius-xl)] p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-[var(--ink)] mb-4">新建工作流</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--ink)] mb-1">名称 *</label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="如：标准开发流程"
                    className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ink)] mb-1">描述</label>
                  <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="可选"
                    className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ink)] mb-1">所属组 *</label>
                  <select value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)]">
                    <option value={0}>请选择组</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.groupName}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)]">取消</button>
                <button onClick={handleCreate} disabled={saving}
                  className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] disabled:opacity-50 flex items-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />} 创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Editor View ──
  if (viewMode === 'editor' && editingWf) {
    return <WorkflowEditor workflow={editingWf} onBack={handleBack} onUpdated={loadWorkflows} />;
  }

  return null;
}

// ── WorkflowEditor (Status + Transition + Flowchart) ──

function WorkflowEditor({ workflow: initialWf, onBack, onUpdated }: {
  workflow: WorkflowDefinition;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [wf, setWf] = useState<WorkflowDefinition>(initialWf);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>(initialWf.statuses);
  const [transitions, setTransitions] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const t of initialWf.transitions) s.add(`${t.fromStatusId}-${t.toStatusId}`);
    return s;
  });
  const [newStatusName, setNewStatusName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<'statuses' | 'transitions' | 'flowchart'>('statuses');
  // 当前展开颜色选择器的 status 行索引(null=都收起)
  const [openColorPicker, setOpenColorPicker] = useState<number | null>(null);

  // Reload
  const reload = async () => {
    try {
      const fresh = await getWorkflow(wf.id);
      setWf(fresh);
      setStatuses(fresh.statuses);
      const s = new Set<string>();
      for (const t of fresh.transitions) s.add(`${t.fromStatusId}-${t.toStatusId}`);
      setTransitions(s);
    } catch { toast.error('加载失败'); }
  };

  // Save statuses
  const handleSaveStatuses = async () => {
    if (statuses.length < 2) { toast.error('至少需要2个状态'); return; }
    setSaving(true);
    try {
      const payload = statuses.map((st, i) => ({
        id: st.id, name: st.name, sortOrder: i,
        isStart: st.isStart, isEnd: st.isEnd, color: st.color,
      }));
      const updated = await updateWorkflowStatuses(wf.id, payload);
      setWf(updated);
      setStatuses(updated.statuses);
      toast.success('状态已保存');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  // Save transitions
  const handleSaveTransitions = async () => {
    setSaving(true);
    try {
      const payload: { fromStatusId: number; toStatusId: number }[] = [];
      for (const key of transitions) {
        const [fid, tid] = key.split('-').map(Number);
        payload.push({ fromStatusId: fid, toStatusId: tid });
      }
      const updated = await updateWorkflowTransitions(wf.id, payload);
      setWf(updated);
      setTransitions(new Set(updated.transitions.map(t => `${t.fromStatusId}-${t.toStatusId}`)));
      toast.success('流转已保存');
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  // Add status
  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    if (statuses.find(s => s.name === newStatusName.trim())) { toast.error('状态名重复'); return; }
    const color = STATUS_COLORS[statuses.length % STATUS_COLORS.length];
    setStatuses(prev => [...prev, {
      id: -(Date.now()), workflowId: wf.id, name: newStatusName.trim(),
      sortOrder: prev.length, isStart: false, isEnd: false, color,
    } as WorkflowStatus]);
    setNewStatusName('');
  };

  // Remove status
  const handleRemoveStatus = (idx: number) => {
    setStatuses(prev => prev.filter((_, i) => i !== idx));
  };

  // Toggle start/end
  const handleToggleStart = (idx: number) => {
    setStatuses(prev => prev.map((s, i) => ({
      ...s, isStart: i === idx ? !s.isStart : s.isStart,
    })));
  };

  const handleToggleEnd = (idx: number) => {
    setStatuses(prev => prev.map((s, i) => ({
      ...s, isEnd: i === idx ? !s.isEnd : s.isEnd,
    })));
  };

  // Drag handlers
  const handleDragStart = (idx: number) => { setDragIndex(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) return;
    setStatuses(prev => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(idx, 0, item);
      return next;
    });
    setDragIndex(idx);
  };
  const handleDragEnd = () => { setDragIndex(null); };

  // ── Render ──

  const groupName = "工作组"; // Could look up from groups

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-[var(--primary)] hover:underline">&larr; 返回列表</button>
          <h3 className="text-[var(--ink)] text-lg font-semibold">{wf.name}</h3>
          <span className={`px-2 py-0.5 text-xs rounded ${wf.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
            {wf.enabled ? '已启用' : '已停用'}
          </span>
        </div>
        <button
          onClick={async () => {
            await updateWorkflow(wf.id, { enabled: !wf.enabled });
            reload();
          }}
          className="px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
        >
          {wf.enabled ? '停用' : '启用'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] p-1">
        {[
          { id: 'statuses' as const, label: '状态定义' },
          { id: 'transitions' as const, label: '流转设置' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${tab === t.id ? 'bg-white text-[var(--ink)] font-medium shadow-sm' : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Statuses */}
      {tab === 'statuses' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-muted-80)]">
            拖拽 <GripVertical size={14} className="inline" /> 调整状态顺序。点击 <Play size={12} className="inline text-green-600" /> 标记起始状态，点击 <Flag size={12} className="inline text-red-600" /> 标记结束状态。
          </p>

          {/* Status list */}
          <div className="space-y-1.5">
            {statuses.map((st, idx) => (
              <div key={st.id ?? `new-${idx}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas)] hover:shadow-sm transition-shadow ${dragIndex === idx ? 'opacity-50' : ''}`}
              >
                <GripVertical size={16} className="text-[var(--ink-muted-48)] cursor-grab shrink-0" />

                {/* Status color picker: 圆点 + 展开 10 色 swatch */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpenColorPicker(openColorPicker === idx ? null : idx)}
                    className="w-4 h-4 rounded-full border border-[var(--hairline)] hover:ring-2 hover:ring-[var(--primary)] hover:ring-offset-1 transition-all"
                    style={{ backgroundColor: st.color || '#94a3b8' }}
                    title="点击切换颜色"
                  />
                  {openColorPicker === idx && (
                    <div
                      className="absolute z-20 left-0 top-6 p-2 bg-white rounded shadow-lg border border-[var(--hairline)] flex gap-1.5"
                      onMouseLeave={() => setOpenColorPicker(null)}
                    >
                      {STATUS_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setStatuses(prev => prev.map((s, i) => i === idx ? { ...s, color: c } : s));
                            setOpenColorPicker(null);
                          }}
                          className={`w-5 h-5 rounded-full hover:ring-2 hover:ring-[var(--primary)] hover:ring-offset-1 transition-all ${st.color === c ? 'ring-2 ring-[var(--primary)] ring-offset-1' : ''}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Order number */}
                <span className="text-xs text-[var(--ink-muted-48)] w-6 text-center shrink-0">{idx + 1}</span>

                {/* Name input */}
                <input
                  type="text"
                  value={st.name}
                  onChange={e => setStatuses(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                  className="flex-1 px-2 py-1 text-sm border border-transparent rounded bg-transparent hover:border-[var(--hairline)] focus:border-[var(--primary)] focus:bg-white focus:outline-none transition-colors"
                />

                {/* Start toggle */}
                <button onClick={() => handleToggleStart(idx)}
                  className={`p-1.5 rounded transition-colors ${st.isStart ? 'text-green-600 bg-green-50' : 'text-[var(--ink-muted-48)] hover:bg-[var(--canvas-parchment)]'}`}
                  title="起始状态"
                >
                  <Play size={14} className={st.isStart ? 'fill-current' : ''} />
                </button>

                {/* End toggle */}
                <button onClick={() => handleToggleEnd(idx)}
                  className={`p-1.5 rounded transition-colors ${st.isEnd ? 'text-red-600 bg-red-50' : 'text-[var(--ink-muted-48)] hover:bg-[var(--canvas-parchment)]'}`}
                  title="结束状态"
                >
                  <CheckCircle size={14} className={st.isEnd ? 'fill-current' : ''} />
                </button>

                {/* Delete */}
                <button onClick={() => handleRemoveStatus(idx)}
                  className="p-1.5 text-[var(--ink-muted-48)] hover:text-red-600 rounded hover:bg-red-50 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Add status */}
          <div className="flex items-center gap-2">
            <input type="text" value={newStatusName}
              onChange={e => setNewStatusName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStatus()}
              placeholder="新状态名称" className="px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:border-[var(--primary)] w-48" />
            <button onClick={handleAddStatus}
              className="px-3 py-2 text-sm border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)]/8 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveStatuses} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm hover:bg-[var(--primary-focus)] disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              <Save size={14} /> 保存状态
            </button>
          </div>
        </div>
      )}

      {/* Tab: Transitions — Checkbox Matrix */}
      {tab === 'transitions' && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--ink-muted-80)]">
            勾选两个状态之间的复选框，表示允许从「行状态」流转到「列状态」。
          </p>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left text-xs text-[var(--ink-muted-80)] font-medium w-20">从 \ 到</th>
                  {statuses.map(st => (
                    <th key={st.id ?? st.name} className="p-2 text-center text-xs font-medium">
                      <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ backgroundColor: st.color || '#94a3b8' }} />
                      <span className="whitespace-nowrap" style={{ color: st.color || undefined }}>{st.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statuses.map(fromSt => (
                  <tr key={fromSt.id ?? fromSt.name} className="border-t border-[var(--divider-soft)]">
                    <td className="p-2 text-xs font-medium text-[var(--ink-muted-80)]">
                      <div className="w-2 h-2 rounded-full inline-block mr-1.5 align-middle" style={{ backgroundColor: fromSt.color || '#94a3b8' }} />
                      {fromSt.name}
                    </td>
                    {statuses.map(toSt => {
                      const key = `${fromSt.id}-${toSt.id}`;
                      const checked = transitions.has(key);
                      const isSelf = fromSt.id === toSt.id;
                      return (
                        <td key={toSt.id ?? toSt.name} className="p-2 text-center">
                          {isSelf ? (
                            <span className="text-[var(--ink-muted-48)]">—</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setTransitions(prev => {
                                const next = new Set(prev);
                                if (checked) next.delete(key);
                                else next.add(key);
                                return next;
                              })}
                              className="w-4 h-4 rounded border-[var(--hairline)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSaveTransitions} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm hover:bg-[var(--primary-focus)] disabled:opacity-50 transition-colors">
              {saving && <Loader2 size={14} className="animate-spin" />}
              <Save size={14} /> 保存流转
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
