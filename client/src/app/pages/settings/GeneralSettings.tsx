import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getModuleOptions, updateModuleOptions } from '../../../api/requirements';
import { SurfaceCard } from '../../components/SurfaceCard';

export function GeneralSettings() {
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newModule, setNewModule] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getModuleOptions()
      .then(setModules)
      .catch(() => toast.error('加载模块选项失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (newModules: string[]) => {
    setSaving(true);
    try {
      await updateModuleOptions(newModules);
      setModules(newModules);
      toast.success('模块选项已保存');
    } catch (err) {
      toast.error((err as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newModule.trim()) return;
    const updated = [...modules, newModule.trim()];
    setNewModule('');
    setShowAdd(false);
    handleSave(updated);
  };

  const handleEdit = (index: number) => {
    if (!editValue.trim()) return;
    const updated = [...modules];
    updated[index] = editValue.trim();
    setEditingIndex(null);
    handleSave(updated);
  };

  const handleDelete = (index: number) => {
    const updated = modules.filter((_, i) => i !== index);
    handleSave(updated);
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(modules[index]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Module Options */}
      <SurfaceCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--ink)]">需求所属模块</h3>
            <p className="text-[13px] text-[var(--ink-muted-80)] mt-1">
              配置「所属模块」字段的下拉选项，用于创建和编辑需求时的选择
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowAdd(true); setNewModule(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-pill)] hover:bg-[var(--primary)]/8 transition-colors"
          >
            <Plus size={14} /> 添加模块
          </button>
        </div>

        {/* Add row */}
        {showAdd && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
            <input
              type="text"
              value={newModule}
              onChange={(e) => setNewModule(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAdd(false); setNewModule(''); } }}
              placeholder="输入模块名称，如：入库管理"
              className="flex-1 px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-sm)] bg-white text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40"
              autoFocus
            />
            <button onClick={handleAdd} disabled={saving}
              className="px-3 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-sm)] text-sm hover:bg-[var(--primary-focus)] disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : '添加'}
            </button>
            <button onClick={() => { setShowAdd(false); setNewModule(''); }}
              className="p-2 text-[var(--ink-muted-60)] hover:text-[var(--ink)] rounded-[var(--radius-sm)] hover:bg-white transition-colors">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Module list */}
        {modules.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted-48)] text-center py-8">暂无模块，点击「添加模块」创建</p>
        ) : (
          <div className="space-y-1.5">
            {modules.map((mod, index) => (
              <div key={index} className="group flex items-center justify-between px-3 py-2 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                {editingIndex === index ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(index); if (e.key === 'Escape') setEditingIndex(null); }}
                      className="flex-1 px-2 py-1 text-sm border border-[var(--hairline)] rounded-[var(--radius-sm)] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--primary)]/40"
                      autoFocus
                    />
                    <button onClick={() => handleEdit(index)}
                      className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded-[var(--radius-sm)]">保存</button>
                    <button onClick={() => setEditingIndex(null)}
                      className="px-2 py-1 text-xs text-[var(--ink-muted-60)] hover:bg-white rounded-[var(--radius-sm)]">取消</button>
                  </div>
                ) : (
                  <>
                    <span className="text-[14px] text-[var(--ink)]">{mod}</span>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button onClick={() => startEdit(index)}
                        className="p-1 text-[var(--ink-muted-60)] hover:text-[var(--primary)] rounded-[var(--radius-sm)] hover:bg-white transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(index)} disabled={saving}
                        className="p-1 text-[var(--ink-muted-60)] hover:text-[var(--destructive)] rounded-[var(--radius-sm)] hover:bg-white transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  );
}
