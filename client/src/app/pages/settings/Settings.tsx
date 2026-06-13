import { useState, useEffect, useRef, useCallback } from 'react';
import { Settings as SettingsIcon, Database, Workflow as WorkflowIcon, Palette, FolderTree, Plus, Trash2, Edit2, Loader2, AlertTriangle, Zap, Upload, FileText, X, BookOpen, Sparkles, Tag, Hash, ChevronDown, ChevronRight } from 'lucide-react';
import { RequirementCategorySettings } from './RequirementCategorySettings';
import { ReqTypeSettings } from './ReqTypeSettings';
import { NumberRuleSettings } from './NumberRuleSettings';
import { TYPE_SETTINGS_MENU, parseSettingsTab } from './type-settings-config';
import { GeneralSettings } from './GeneralSettings';
import { WorkflowDesigner } from './WorkflowDesigner';
import { AISettings } from './AISettings';
import { RagSettings } from './RagSettings';
import { TeamLearningSettings } from './TeamLearningSettings';
import { SkillsSettings } from './SkillsSettings';
import { toast } from 'sonner';
import {
  listKnowledgeBases,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  syncKnowledgeBase,
  syncKnowledgeBaseAsync,
  getKbSyncJob,
  uploadKnowledgeFiles,
  type KnowledgeBaseStatus,
  type KbRoutingExample,
} from '../../../api/settings';
import { KB_DOC_TYPE_OPTIONS } from 'shared-types';
import { authStore } from '../../../stores/auth';
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  type CustomField,
} from '../../../api/settings';
import { AppPageShell } from '../../components/AppPageShell';
import { PageHeader } from '../../components/PageHeader';
import { SurfaceCard } from '../../components/SurfaceCard';

type Tab = string;

const FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'CHECKBOX'];

type NavItem = { id: Tab; icon: React.ReactNode; label: string };

type NavGroup = {
  id: string;
  icon: React.ReactNode;
  label: string;
  children: NavItem[];
};

function SettingsNavItem({
  item,
  active,
  onSelect,
  indent = false,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (id: Tab) => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`w-full flex items-center gap-2.5 py-2 rounded-[var(--radius-md)] text-[13px] transition-colors text-left ${
        indent ? 'pl-8 pr-3' : 'px-3'
      } ${
        active
          ? 'bg-[var(--canvas-parchment)] text-[var(--ink)] font-medium'
          : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)] hover:bg-[var(--canvas-parchment)]/50'
      }`}
    >
      {item.icon}
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function SettingsNavGroup({
  group,
  expanded,
  activeTab,
  onToggle,
  onSelect,
}: {
  group: NavGroup;
  expanded: boolean;
  activeTab: Tab;
  onToggle: () => void;
  onSelect: (id: Tab) => void;
}) {
  const childActive = group.children.some((c) => c.id === activeTab);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-[13px] transition-colors text-left ${
          childActive
            ? 'text-[var(--ink)] font-medium'
            : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)] hover:bg-[var(--canvas-parchment)]/50'
        }`}
      >
        {expanded ? <ChevronDown size={14} className="shrink-0 opacity-60" /> : <ChevronRight size={14} className="shrink-0 opacity-60" />}
        {group.icon}
        <span className="truncate">{group.label}</span>
      </button>
      {expanded && (
        <div className="mt-0.5 space-y-0.5">
          {group.children.map((child) => (
            <SettingsNavItem
              key={child.id}
              item={child}
              active={activeTab === child.id}
              onSelect={onSelect}
              indent
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    categories: false,
    numberRule: false,
  });

  const parsedTab = parseSettingsTab(activeTab);

  useEffect(() => {
    if (parsedTab) {
      setExpandedGroups((prev) => ({ ...prev, [parsedTab.kind]: true }));
    }
  }, [parsedTab?.kind]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectTab = (id: Tab) => {
    setActiveTab(id);
    const parsed = parseSettingsTab(id);
    if (parsed) {
      setExpandedGroups((prev) => ({ ...prev, [parsed.kind]: true }));
    }
  };

  const flatTabs: NavItem[] = [
    { id: 'ai', icon: <Sparkles size={16} />, label: 'AI 设置' },
    { id: 'skills', icon: <Zap size={16} />, label: 'AI Skills' },
    { id: 'rag', icon: <Database size={16} />, label: 'RAG 设置' },
    { id: 'learnings', icon: <BookOpen size={16} />, label: '团队经验' },
    { id: 'general', icon: <SettingsIcon size={16} />, label: '基本设置' },
    { id: 'knowledge', icon: <Database size={16} />, label: '知识库' },
    { id: 'workflow', icon: <WorkflowIcon size={16} />, label: '工作流' },
    { id: 'fields', icon: <Palette size={16} />, label: '自定义字段' },
    { id: 'reqTypes', icon: <Tag size={16} />, label: '需求类型' },
  ];

  const navGroups: NavGroup[] = [
    {
      id: 'categories',
      icon: <FolderTree size={16} />,
      label: '分类',
      children: TYPE_SETTINGS_MENU.map((t) => ({
        id: `categories:${t.code}`,
        icon: <FolderTree size={14} />,
        label: `${t.label}分类`,
      })),
    },
    {
      id: 'numberRule',
      icon: <Hash size={16} />,
      label: '编码',
      children: TYPE_SETTINGS_MENU.map((t) => ({
        id: `numberRule:${t.code}`,
        icon: <Hash size={14} />,
        label: `${t.label}编码`,
      })),
    },
  ];

  const typeLabel =
    parsedTab &&
    TYPE_SETTINGS_MENU.find((t) => t.code === parsedTab.reqType)?.label;

  return (
    <AppPageShell maxWidth="1200px">
      <PageHeader title="系统设置" description="配置系统参数和偏好设置" />

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav
          className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-2 h-fit md:sticky md:top-4 space-y-0.5"
          aria-label="设置分类"
        >
          {flatTabs.slice(0, 6).map((t) => (
            <SettingsNavItem key={t.id} item={t} active={activeTab === t.id} onSelect={selectTab} />
          ))}
          {navGroups.map((g) => (
            <SettingsNavGroup
              key={g.id}
              group={g}
              expanded={!!expandedGroups[g.id]}
              activeTab={activeTab}
              onToggle={() => toggleGroup(g.id)}
              onSelect={selectTab}
            />
          ))}
          {flatTabs.slice(6).map((t) => (
            <SettingsNavItem key={t.id} item={t} active={activeTab === t.id} onSelect={selectTab} />
          ))}
        </nav>

      <SurfaceCard padding="lg">
        {activeTab === 'ai' && <AISettings />}
        {activeTab === 'skills' && <SkillsSettings />}
        {activeTab === 'rag' && <RagSettings />}
        {activeTab === 'learnings' && <TeamLearningSettings />}
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'knowledge' && <KnowledgeSettings />}
        {parsedTab?.kind === 'categories' && typeLabel && (
          <RequirementCategorySettings
            reqType={parsedTab.reqType}
            title={`${typeLabel}分类`}
          />
        )}
        {parsedTab?.kind === 'numberRule' && typeLabel && (
          <NumberRuleSettings reqType={parsedTab.reqType} title={`${typeLabel}编码`} />
        )}
        {activeTab === 'workflow' && <WorkflowDesigner />}
        {activeTab === 'fields' && <CustomFieldSettings />}
        {activeTab === 'reqTypes' && <ReqTypeSettings />}
        </SurfaceCard>
      </div>
    </AppPageShell>
  );
}

function KbRoutingEditModal({
  editKb,
  kbs,
  editDescription,
  setEditDescription,
  editRoutingExamples,
  setEditRoutingExamples,
  saving,
  onClose,
  onSave,
}: {
  editKb: KnowledgeBaseStatus;
  kbs: KnowledgeBaseStatus[];
  editDescription: string;
  setEditDescription: (v: string) => void;
  editRoutingExamples: KbRoutingExample[];
  setEditRoutingExamples: React.Dispatch<React.SetStateAction<KbRoutingExample[]>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-2 text-[var(--ink)]">知识库路由配置</h3>
        <p className="text-sm text-[var(--ink-muted-80)] mb-4">
          {editKb.displayName || editKb.name} — 说明与样例会写入智能选库 catalog
        </p>

        <label className="block text-sm font-medium text-[var(--ink)] mb-1.5">路由说明</label>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          rows={4}
          placeholder="如：WMOS 表结构、字段说明；入库/出库业务流程设计文档"
          className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none text-sm mb-4"
        />

        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--ink)]">路由样例</label>
          <button
            type="button"
            onClick={() =>
              setEditRoutingExamples((prev) => [
                ...prev,
                { question: '', kbIds: [editKb.id] },
              ])
            }
            className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
          >
            <Plus size={14} /> 添加样例
          </button>
        </div>
        <p className="text-xs text-[var(--ink-muted-80)] mb-3">
          示例：「库存表有哪些」应选中哪些库。可跨库勾选多个。
        </p>

        {editRoutingExamples.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted-80)] italic mb-4">暂无样例</p>
        ) : (
          <div className="space-y-3 mb-4">
            {editRoutingExamples.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas-parchment)] space-y-2"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--ink-muted-80)]">样例 {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setEditRoutingExamples((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-[var(--destructive)] hover:opacity-80"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  value={ex.question}
                  onChange={(e) =>
                    setEditRoutingExamples((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, question: e.target.value } : item
                      )
                    )
                  }
                  placeholder="示例问题"
                  className="w-full px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas)]"
                />
                <div className="flex flex-wrap gap-2">
                  {kbs.map((kbItem) => (
                    <label
                      key={kbItem.id}
                      className="flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded-full border border-[var(--hairline)] bg-[var(--canvas)]"
                    >
                      <input
                        type="checkbox"
                        checked={ex.kbIds.includes(kbItem.id)}
                        onChange={(e) => {
                          setEditRoutingExamples((prev) =>
                            prev.map((item, i) => {
                              if (i !== idx) return item;
                              const ids = e.target.checked
                                ? [...item.kbIds, kbItem.id]
                                : item.kbIds.filter((id) => id !== kbItem.id);
                              return { ...item, kbIds: ids };
                            })
                          );
                        }}
                      />
                      {kbItem.displayName || kbItem.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================= Knowledge Base Settings =================

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

function KnowledgeSettings() {
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const [kbs, setKbs] = useState<KnowledgeBaseStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editKb, setEditKb] = useState<KnowledgeBaseStatus | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editRoutingExamples, setEditRoutingExamples] = useState<KbRoutingExample[]>([]);
  const [savingDesc, setSavingDesc] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: '',
    displayName: '',
    basePath: '',
    sourceType: 'directory' as 'directory' | 'upload',
    description: '',
    docType: 'PRODUCT_DOC',
  });

  const fetchKbs = async () => {
    setLoading(true);
    try {
      const data = await listKnowledgeBases();
      setKbs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbs();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('标识不能为空'); return; }
    if (!form.displayName.trim()) { toast.error('名称不能为空'); return; }
    if (form.sourceType === 'directory' && !form.basePath.trim()) { toast.error('路径不能为空'); return; }

    try {
      await createKnowledgeBase({
        name: form.name,
        displayName: form.displayName,
        description: form.description,
        docType: form.docType,
        sourceType: form.sourceType,
        basePath:
          form.sourceType === 'upload'
            ? 'uploads/kb/_pending'
            : form.basePath,
      });
      toast.success('知识库创建成功');
      setShowCreate(false);
      setForm({ name: '', displayName: '', basePath: '', sourceType: 'directory', description: '', docType: 'PRODUCT_DOC' });
      fetchKbs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleSaveDescription = async () => {
    if (!editKb) return;
    for (const ex of editRoutingExamples) {
      if (!ex.question.trim()) {
        toast.error('路由样例的问题不能为空');
        return;
      }
      if (ex.kbIds.length === 0) {
        toast.error('每个路由样例至少选择一个知识库');
        return;
      }
    }
    setSavingDesc(true);
    try {
      await updateKnowledgeBase(editKb.id, {
        description: editDescription.trim() || undefined,
        routingExamples:
          editRoutingExamples.length > 0
            ? editRoutingExamples.map((ex) => ({
                question: ex.question.trim(),
                kbIds: ex.kbIds,
                ...(ex.note?.trim() ? { note: ex.note.trim() } : {}),
              }))
            : null,
      });
      toast.success('路由说明与样例已保存');
      setEditKb(null);
      fetchKbs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingDesc(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除该知识库吗？所有关联的文档和分块也将被删除。')) return;
    try {
      await deleteKnowledgeBase(id);
      toast.success('已删除');
      fetchKbs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      const start = await syncKnowledgeBaseAsync(id);
      if (!start.ok || !start.jobId) {
        toast.error(start.error || '启动同步失败');
        return;
      }
      const jobId = start.jobId;
      const poll = (): Promise<void> =>
        new Promise((resolve, reject) => {
          const tick = async () => {
            try {
              const job = await getKbSyncJob(jobId);
              if (job.status === 'completed') {
                const n = job.documents ?? 0;
                const msg = n > 0
                  ? `同步完成：${n} 个文档，${job.chunks ?? 0} 个分块`
                  : '同步完成，但无新内容（目录为空或数据已是最新）';
                toast.success(msg);
                resolve();
                return;
              }
              if (job.status === 'failed') {
                reject(new Error(job.error || '同步失败'));
                return;
              }
              setTimeout(tick, 1500);
            } catch (e) {
              reject(e);
            }
          };
          tick();
        });
      await poll();
      fetchKbs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(null);
    }
  };

  const handleUpload = async (kbId: number) => {
    if (selectedFiles.length === 0) { toast.error('请选择文件'); return; }
    setUploading(kbId);
    try {
      const result = await uploadKnowledgeFiles(kbId, selectedFiles);
      if (result.ok) {
        toast.success(`上传并同步完成：${result.documents} 个文档，${result.chunks} 个分块`);
        setShowUpload(null);
        setSelectedFiles([]);
        fetchKbs();
      } else {
        toast.error(result.error || '上传失败');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setSelectedFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[var(--ink)]">知识库管理</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
        >
          <Plus size={18} /> <span>添加知识库</span>
        </button>
      </div>

      {kbs.length === 0 ? (
        <div className="text-center py-12 text-[var(--ink-muted-80)]">
          <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
          <p className="mb-2">暂无知识库</p>
          <p className="text-sm">点击"添加知识库"创建第一个知识库</p>
        </div>
      ) : (
        <div className="space-y-4">
          {kbs.map((kb) => (
            <div
              key={kb.id}
              className="flex items-center justify-between p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-[var(--ink)]">{kb.displayName || kb.name}</span>
                  <span className="text-xs text-[var(--ink-muted-80)] font-mono">({kb.name})</span>
                  {kb.sourceType === 'upload' ? (
                    <span className="px-2 py-0.5 bg-[#e3f2fd] text-[#1565c0] rounded-full text-xs">上传模式</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#f3e5f5] text-[#7b1fa2] rounded-full text-xs">目录模式</span>
                  )}
                  {kb.enabled ? (
                    <span className="px-2 py-0.5 bg-[#d4edda] text-[#155724] rounded-full text-xs">已启用</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-[#f8d7da] text-[#721c24] rounded-full text-xs">已禁用</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-[var(--ink-muted-80)]">
                  <span>{kb.documentCount} 个文档</span>
                  <span>{kb.chunkCount} 个分块</span>
                  <span>上次同步: {kb.lastSyncedAt ? new Date(kb.lastSyncedAt).toLocaleString('zh-CN') : '从未'}</span>
                </div>
                {kb.description ? (
                  <p className="mt-2 text-sm text-[var(--ink-muted-80)] line-clamp-2">{kb.description}</p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--ink-muted-80)] italic">未填写路由说明（智能选库准确度会下降）</p>
                )}
                {(kb.routingExamples?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-[var(--primary)]">
                    {kb.routingExamples!.length} 条路由样例
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => {
                      setEditKb(kb);
                      setEditDescription(kb.description || '');
                      setEditRoutingExamples(
                        kb.routingExamples?.map((ex) => ({
                          question: ex.question,
                          kbIds: [...ex.kbIds],
                          note: ex.note,
                        })) ?? []
                      );
                    }}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--ink)] border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas)] transition-colors"
                  >
                    <Edit2 size={14} /> <span>路由</span>
                  </button>
                )}
                {kb.sourceType === 'upload' && (
                  <button
                    onClick={() => setShowUpload(kb.id)}
                    className="flex items-center gap-1 px-3 py-2 text-sm text-[#1565c0] border border-[#1565c0] rounded-[var(--radius-md)] hover:bg-[#1565c0] hover:text-white transition-colors"
                  >
                    <Upload size={14} /> <span>上传</span>
                  </button>
                )}
                <button
                  onClick={() => handleSync(kb.id)}
                  disabled={syncing === kb.id}
                  className="px-3 py-2 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50"
                >
                  {syncing === kb.id ? <Loader2 size={14} className="animate-spin" /> : '同步'}
                </button>
                <button
                  onClick={() => handleDelete(kb.id)}
                  className="p-2 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editKb && (
        <KbRoutingEditModal
          editKb={editKb}
          kbs={kbs}
          editDescription={editDescription}
          setEditDescription={setEditDescription}
          editRoutingExamples={editRoutingExamples}
          setEditRoutingExamples={setEditRoutingExamples}
          saving={savingDesc}
          onClose={() => setEditKb(null)}
          onSave={handleSaveDescription}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-6 text-[var(--ink)]">添加知识库</h3>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">标识 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  placeholder="wmos_knowledge"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">名称 *</label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  placeholder="WMOS 知识库"
                />
              </div>

              {/* Source Type Selector */}
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">来源类型 *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sourceType: 'directory' }))}
                    className={`px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium text-left transition-colors border ${
                      form.sourceType === 'directory'
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--canvas)] text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--primary)]'
                    }`}
                  >
                    <Database size={16} className="inline mr-1" /> 外部目录
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, sourceType: 'upload' }))}
                    className={`px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium text-left transition-colors border ${
                      form.sourceType === 'upload'
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                        : 'bg-[var(--canvas)] text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--primary)]'
                    }`}
                  >
                    <Upload size={16} className="inline mr-1" /> 本地上传
                  </button>
                </div>
              </div>

              {/* Path input — only for directory mode */}
              {form.sourceType === 'directory' && (
                <div>
                  <label className="block mb-2 text-sm text-[var(--ink)]">路径 *</label>
                  <input
                    type="text"
                    value={form.basePath}
                    onChange={(e) => setForm((f) => ({ ...f, basePath: e.target.value }))}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
                    placeholder="/path/to/docs"
                  />
                  <p className="mt-1 text-xs text-[var(--ink-muted-80)]">服务端可访问的目录路径</p>
                </div>
              )}
              {form.sourceType === 'upload' && (
                <div className="p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] text-sm text-[var(--ink-muted-80)]">
                  <FileText size={14} className="inline mr-1" />
                  创建后可在知识库列表中点击"上传"按钮添加文档
                </div>
              )}

              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">文档类型 (docType)</label>
                <select
                  value={form.docType}
                  onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {KB_DOC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">描述</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="如：WMOS 表结构、字段说明；入库/出库业务流程设计文档"
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={3}
                />
                <p className="mt-1 text-xs text-[var(--ink-muted-80)]">
                  开启「智能选库」后，AI 根据名称与本描述判断问题应检索哪个库
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-6 text-[var(--ink)]">上传文档</h3>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-[var(--radius-lg)] p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--hairline)] hover:border-[var(--primary)]'
              }`}
            >
              <Upload size={32} className="mx-auto mb-3 text-[var(--ink-muted-80)]" />
              <p className="text-[var(--ink)] mb-1">拖拽文件到此处，或点击选择</p>
              <p className="text-xs text-[var(--ink-muted-80)]">支持 .md / .txt / .sql / .java / .vue / .ts / .tsx / .pdf，单文件 ≤ 2MB</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".md,.txt,.sql,.java,.vue,.ts,.tsx,.pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* File List */}
            {selectedFiles.length > 0 && (
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText size={14} className="text-[var(--ink-muted-80)]" />
                      <span className="text-[var(--ink)]">{file.name}</span>
                      <span className="text-xs text-[var(--ink-muted-80)]">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <button onClick={() => removeFile(index)} className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas)] rounded transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowUpload(null); setSelectedFiles([]); }}
                className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
              >
                取消
              </button>
              <button
                onClick={() => handleUpload(showUpload)}
                disabled={uploading === showUpload || selectedFiles.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50"
              >
                {uploading === showUpload ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploading === showUpload ? '上传中...' : `上传并同步 (${selectedFiles.length} 个文件)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= Workflow Settings =================

// ================= Custom Field Settings =================

function CustomFieldSettings() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [newField, setNewField] = useState({
    fieldName: '',
    fieldKey: '',
    fieldType: 'TEXT',
    required: false,
    placeholder: '',
  });
  const [editForm, setEditForm] = useState({
    fieldName: '',
    fieldKey: '',
    fieldType: 'TEXT',
    required: false,
    placeholder: '',
  });

  const loadFields = useCallback(() => {
    setLoading(true);
    listCustomFields()
      .then(setFields)
      .catch(() => setFields([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFields(); }, [loadFields]);

  const handleCreate = async () => {
    if (!newField.fieldName.trim()) { toast.error('字段名不能为空'); return; }
    if (!newField.fieldKey.trim()) { toast.error('字段标识不能为空'); return; }

    try {
      await createCustomField({
        fieldName: newField.fieldName.trim(),
        fieldKey: newField.fieldKey.trim(),
        fieldType: newField.fieldType,
        required: newField.required,
        placeholder: newField.placeholder || undefined,
        sortOrder: fields.length,
      });
      toast.success('字段创建成功');
      setShowCreate(false);
      setNewField({ fieldName: '', fieldKey: '', fieldType: 'TEXT', required: false, placeholder: '' });
      loadFields();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setEditForm({
      fieldName: field.fieldName,
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      required: field.required,
      placeholder: field.placeholder || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;
    if (!editForm.fieldName.trim()) { toast.error('字段名不能为空'); return; }
    if (!editForm.fieldKey.trim()) { toast.error('字段标识不能为空'); return; }

    try {
      await updateCustomField(editingField.id, {
        fieldName: editForm.fieldName.trim(),
        fieldKey: editForm.fieldKey.trim(),
        fieldType: editForm.fieldType,
        required: editForm.required,
        placeholder: editForm.placeholder || undefined,
      });
      toast.success('字段更新成功');
      setEditingField(null);
      loadFields();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除该自定义字段吗？关联的需求数据也会被清除。')) return;
    try {
      await deleteCustomField(id);
      toast.success('字段已删除');
      loadFields();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const FIELD_TYPES = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'CHECKBOX'];

  return (
    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[var(--ink)]">自定义字段</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
        >
          <Plus size={18} /> <span>添加字段</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : fields.length === 0 ? (
        <div className="text-center py-12 text-[var(--ink-muted-80)]">
          暂无自定义字段，点击上方按钮添加
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <div
              key={field.id}
              className="flex items-center justify-between p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-[var(--ink)]">{field.fieldName}</span>
                  {field.required && <span className="text-[var(--destructive)]">*</span>}
                  <span className="text-xs text-[var(--ink-muted-80)] font-mono">({field.fieldKey})</span>
                </div>
                <div className="text-sm text-[var(--ink-muted-80)]">
                  类型: {field.fieldType}
                  {field.placeholder && ` · 占位: ${field.placeholder}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(field)}
                  className="p-2 text-[var(--primary)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                  title="编辑"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(field.id)}
                  className="p-2 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-6 text-[var(--ink)]">添加自定义字段</h3>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">字段名 *</label>
                <input
                  type="text"
                  value={newField.fieldName}
                  onChange={(e) => setNewField((f) => ({ ...f, fieldName: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  placeholder="例如：GSP影响"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">字段标识 *</label>
                <input
                  type="text"
                  value={newField.fieldKey}
                  onChange={(e) => setNewField((f) => ({ ...f, fieldKey: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  placeholder="gsp_impact"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">类型</label>
                <select
                  value={newField.fieldType}
                  onChange={(e) => setNewField((f) => ({ ...f, fieldType: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">占位符</label>
                <input
                  type="text"
                  value={newField.placeholder}
                  onChange={(e) => setNewField((f) => ({ ...f, placeholder: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newField.required}
                    onChange={(e) => setNewField((f) => ({ ...f, required: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
                <span className="text-sm text-[var(--ink)]">必填字段</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-6 text-[var(--ink)]">编辑自定义字段</h3>
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">字段名 *</label>
                <input
                  type="text"
                  value={editForm.fieldName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fieldName: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">字段标识 *</label>
                <input
                  type="text"
                  value={editForm.fieldKey}
                  onChange={(e) => setEditForm((f) => ({ ...f, fieldKey: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">类型</label>
                <select
                  value={editForm.fieldType}
                  onChange={(e) => setEditForm((f) => ({ ...f, fieldType: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block mb-2 text-sm text-[var(--ink)]">占位符</label>
                <input
                  type="text"
                  value={editForm.placeholder}
                  onChange={(e) => setEditForm((f) => ({ ...f, placeholder: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.required}
                    onChange={(e) => setEditForm((f) => ({ ...f, required: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
                <span className="text-sm text-[var(--ink)]">必填字段</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingField(null)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
              <button onClick={handleSaveEdit} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
