import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, Loader2, Wand2, Eye, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  getRequirement,
  updateRequirement,
  getModuleOptions,
  type RequirementDetail,
  type Priority,
  type ReqType,
} from '../../../api/requirements';
import { CategoryTreeSelect } from '../../components/CategoryTreeSelect';
import { generateDesignSolution } from '../../../api/agent';
import { listWorkflows, listCustomFields, type CustomField } from '../../../api/settings';
import { listRequirementTypes } from '../../../api/req-types';
import type { RequirementTypeItem } from 'shared-types';
import { CustomFieldsForm } from '../../components/CustomFieldsForm';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DesignMode = 'text' | 'markdown';

const STATUS_OPTIONS = ['待评审', '评审中', '设计中', '开发中', '测试中', '已完成'];

export function EditRequirement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingDesign, setGeneratingDesign] = useState(false);
  const [designMode, setDesignMode] = useState<DesignMode>('text');
  const [designPreview, setDesignPreview] = useState(false);
  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [allowedTransitions, setAllowedTransitions] = useState<Array<{ from: string; to: string }>>([]);
  const [reqTypes, setReqTypes] = useState<RequirementTypeItem[]>([]);
  const [req, setReq] = useState<RequirementDetail | null>(null);
  const [form, setForm] = useState({
    title: '',
    categoryId: '' as number | '',
    reqType: 'REQUIREMENT',
    priority: 'P1' as Priority,
    status: '待评审',
    module: '',
    assignee: '',
    targetDate: '',
    tags: '',
    background: '',
    description: '',
    designSolution: '',
  });

  useEffect(() => { getModuleOptions().then(setModuleOptions).catch(() => {}); }, []);
  useEffect(() => { listRequirementTypes().then(setReqTypes).catch(() => setReqTypes([])); }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getRequirement(parseInt(id))
      .then((data) => {
        setReq(data);
        const tags = Array.isArray(data.tags) ? data.tags.join(', ') : '';
        const targetDate = data.targetDate ? data.targetDate.slice(0, 10) : '';
        setForm({
          title: data.title || '',
          categoryId: data.categoryId ?? '',
          reqType: data.reqType,
          priority: data.priority as Priority,
          status: data.status || '待评审',
          module: data.module || '',
          assignee: data.assignee || '',
          targetDate,
          tags,
          background: data.background || '',
          description: data.description || '',
          designSolution: data.designSolution || '',
        });
        // Populate custom field values from the loaded requirement
        if (data.customValues) {
          const cfValues: Record<number, string> = {};
          data.customValues.forEach(cv => { cfValues[cv.fieldId] = cv.value; });
          setCustomFieldValues(cfValues);
        }
        // Auto-detect mode: if designSolution has markdown markers, use MD mode
        if (data.designSolution && /^#{1,4}\s|^\*{2}|\n- |\n\d+\. |```/m.test(data.designSolution)) {
          setDesignMode('markdown');
        }
        // Fetch workflow transitions for this requirement's group
        if (data.groupName) {
          listWorkflows()
            .then(wfs => {
              const enabled = wfs.filter(w => w.enabled);
              setAllowedTransitions(enabled.flatMap(w =>
                w.transitions.map(t => ({
                  from: w.statuses.find(s => s.id === t.fromStatusId)?.name ?? "",
                  to: w.statuses.find(s => s.id === t.toStatusId)?.name ?? "",
                }))
              ));
            })
            .catch(() => setAllowedTransitions([]));
        }
        // Load global custom fields
        listCustomFields()
          .then(fields => setCustomFields(fields))
          .catch(() => setCustomFields([]));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.title.trim()) {
      toast.error('请输入需求标题');
      return;
    }

    setSubmitting(true);
    try {
      const tags = form.tags
        ? form.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;

      if (!form.categoryId) {
        toast.error('请选择需求分类');
        return;
      }

      await updateRequirement(parseInt(id), {
        reqType: form.reqType as ReqType,
        title: form.title.trim(),
        categoryId: form.categoryId as number,
        priority: form.priority,
        status: form.status,
        module: form.module || undefined,
        assignee: form.assignee || undefined,
        targetDate: form.targetDate || undefined,
        tags,
        background: form.background || undefined,
        description: form.description || undefined,
        designSolution: form.designSolution || undefined,
        customValues: Object.entries(customFieldValues)
          .filter(([, v]) => v !== '' && v !== undefined)
          .map(([fieldId, value]) => ({ fieldId: parseInt(fieldId, 10), value })),
      });

      toast.success('需求更新成功！');
      navigate(`/app/requirements/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** AI 生成设计方案 */
  const handleGenerateDesign = async () => {
    if (!req || !form.description.trim()) {
      toast.error('请先填写需求描述');
      return;
    }
    setGeneratingDesign(true);
    toast.loading('AI 正在生成设计方案...', { id: 'gen-design' });
    try {
      const result = await generateDesignSolution({
        title: form.title.trim(),
        description: form.description.trim(),
        background: form.background || undefined,
        module: form.module || undefined,
      });
      setForm((prev) => ({ ...prev, designSolution: result.designSolution }));
      setDesignMode('markdown'); // AI 生成 → 自动切到 MD 模式
      setDesignPreview(false);
      toast.success('设计方案已生成（Markdown 格式）', { id: 'gen-design' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 生成失败', { id: 'gen-design' });
    } finally {
      setGeneratingDesign(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!req) {
    return (
      <div className="p-6 text-center py-32">
        <p className="text-[var(--destructive)] mb-4">需求不存在</p>
        <Link to="/app/requirements" className="text-[var(--primary)] hover:underline">
          返回需求列表
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-[900px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to={`/app/requirements/${id}`}
            className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft size={18} />
            返回需求详情
          </Link>
          <h2 className="mb-2">编辑需求</h2>
          <p className="text-[var(--ink-muted-80)]">
            编号: <span className="font-mono">{req.reqNo}</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 mb-6">
            <div className="space-y-6">
              {/* Type & Category & Priority */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block mb-2 text-[var(--ink)]">需求类型</label>
                  <select
                    value={form.reqType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setForm((prev) => ({ ...prev, reqType: nextType, categoryId: '' }));
                    }}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    {reqTypes.length === 0 && <option value={form.reqType}>{form.reqType}</option>}
                    {reqTypes.map((t) => (
                      <option key={t.code} value={t.code}>{t.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">需求分类</label>
                  <CategoryTreeSelect
                    value={form.categoryId}
                    reqType={form.reqType}
                    excludeRoot
                    onChange={(categoryId) =>
                      setForm((prev) => ({ ...prev, categoryId }))
                    }
                  />
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">优先级</label>
                  <select
                    value={form.priority}
                    onChange={(e) => handleChange('priority', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="P0">P0 — 紧急</option>
                    <option value="P1">P1 — 高</option>
                    <option value="P2">P2 — 中</option>
                    <option value="P3">P3 — 低</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">状态</label>
                  <select
                    value={form.status}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    {/* Always show current status */}
                    <option value={form.status} key="current">{form.status} (当前)</option>
                    {/* Only show allowed next statuses */}
                    {allowedTransitions
                      .filter((t) => t.from === form.status)
                      .map((t) => (
                        <option key={t.to} value={t.to}>→ {t.to}</option>
                      ))}
                    {/* If no transitions configured, show all */}
                    {allowedTransitions.length === 0 && STATUS_OPTIONS.filter(s => s !== form.status).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {allowedTransitions.length > 0 && allowedTransitions.filter(t => t.from === form.status).length === 0 && (
                    <p className="text-xs text-[var(--ink-muted-48)] mt-1">当前状态无法流转到其他状态（终态）</p>
                  )}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">需求标题 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  required
                />
              </div>

              {/* Module & Assignee */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 text-[var(--ink)]">所属模块</label>
                  <select
                    value={form.module}
                    onChange={(e) => handleChange('module', e.target.value)}
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">请选择模块</option>
                    {moduleOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">负责人</label>
                  <input
                    type="text"
                    value={form.assignee}
                    onChange={(e) => handleChange('assignee', e.target.value)}
                    placeholder="例如：张三"
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Target Date & Tags */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-2 text-[var(--ink)]">期望日期</label>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => handleChange('targetDate', e.target.value)}
                    className="w-full max-w-xs px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block mb-2 text-[var(--ink)]">标签</label>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => handleChange('tags', e.target.value)}
                    placeholder="GSP, 追溯"
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Background */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">需求背景</label>
                <textarea
                  value={form.background}
                  onChange={(e) => handleChange('background', e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={4}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block mb-2 text-[var(--ink)]">需求描述 *</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={6}
                  required
                />
              </div>

              {/* Design Proposal */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[var(--ink)]">设计方案</label>
                  <div className="flex items-center gap-2">
                    {/* Text / MD mode toggle */}
                    <div className="flex items-center border border-[var(--hairline)] rounded-[var(--radius-pill)] overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { setDesignMode('text'); setDesignPreview(false); }}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                          designMode === 'text'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)]'
                        }`}
                      >
                        文本
                      </button>
                      <button
                        type="button"
                        onClick={() => setDesignMode('markdown')}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                          designMode === 'markdown'
                            ? 'bg-[var(--primary)] text-white'
                            : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)]'
                        }`}
                      >
                        Markdown
                      </button>
                    </div>
                    {/* Preview toggle (MD mode only) */}
                    {designMode === 'markdown' && form.designSolution && (
                      <button
                        type="button"
                        onClick={() => setDesignPreview(!designPreview)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-[var(--ink-muted-80)] border border-[var(--hairline)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
                      >
                        {designPreview ? <><Pencil size={12} /> 编辑</> : <><Eye size={12} /> 预览</>}
                      </button>
                    )}
                    {/* AI generate button */}
                    <button
                      type="button"
                      onClick={handleGenerateDesign}
                      disabled={generatingDesign || !form.description.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-pill)] hover:bg-[var(--primary)] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {generatingDesign ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      AI 生成
                    </button>
                  </div>
                </div>

                {/* Text mode: plain textarea */}
                {designMode === 'text' && (
                  <textarea
                    value={form.designSolution}
                    onChange={(e) => handleChange('designSolution', e.target.value)}
                    placeholder="技术实现方案和设计思路..."
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                    rows={8}
                  />
                )}

                {/* Markdown mode: editor or preview */}
                {designMode === 'markdown' && !designPreview && (
                  <textarea
                    value={form.designSolution}
                    onChange={(e) => handleChange('designSolution', e.target.value)}
                    placeholder="支持 Markdown 语法：# 标题、**粗体**、- 列表、```代码``` 等..."
                    className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none font-mono text-sm"
                    rows={10}
                  />
                )}
                {designMode === 'markdown' && designPreview && (
                  <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] p-5 bg-[var(--canvas-parchment)] min-h-[200px]">
                    {form.designSolution ? (
                      <div className="text-[var(--ink)] leading-relaxed">
                        <ReactMarkdown
                          skipHtml
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h1 className="text-xl font-bold text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-3 mt-0">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-lg font-semibold text-[var(--ink)] border-b border-[var(--hairline)] pb-1 mb-2 mt-5">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-base font-semibold text-[var(--ink)] mt-3 mb-1.5">{children}</h3>,
                            p: ({ children }) => <p className="text-[var(--ink-muted-80)] leading-relaxed mb-2">{children}</p>,
                            code: ({ className, children }) => {
                              const isInline = !className;
                              return isInline
                                ? <code className="px-1 py-0.5 bg-[var(--canvas)] text-[var(--primary)] rounded text-xs font-mono">{children}</code>
                                : <code className="block p-3 bg-[var(--canvas)] rounded text-xs font-mono overflow-x-auto my-2">{children}</code>;
                            },
                            pre: ({ children }) => <pre className="p-3 bg-[var(--canvas)] rounded overflow-x-auto my-2">{children}</pre>,
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-3">
                                <table className="min-w-full border-collapse border border-[var(--hairline)] text-sm">{children}</table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-[var(--canvas)]">{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => <tr className="border-b border-[var(--hairline)]">{children}</tr>,
                            th: ({ children }) => <th className="px-3 py-1.5 border-r border-[var(--hairline)] text-sm font-semibold text-[var(--ink)] text-left">{children}</th>,
                            td: ({ children }) => <td className="px-3 py-1.5 border-r border-[var(--hairline)] text-sm text-[var(--ink-muted-80)]">{children}</td>,
                            ul: ({ children }) => <ul className="list-disc list-inside text-[var(--ink-muted-80)] space-y-0.5 mb-2">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside text-[var(--ink-muted-80)] space-y-0.5 mb-2">{children}</ol>,
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--primary)] pl-3 text-[var(--ink-muted-80)] italic mb-2">{children}</blockquote>,
                            hr: () => <hr className="border-[var(--hairline)] my-3" />,
                            li: ({ children }) => <li className="text-[var(--ink-muted-80)]">{children}</li>,
                          }}
                        >
                          {form.designSolution}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-[var(--ink-muted-48)] text-center py-8">内容为空，切换回编辑模式输入内容</p>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Fields */}
              <CustomFieldsForm
                fields={customFields}
                values={customFieldValues}
                onChange={(fieldId, value) => {
                  setCustomFieldValues((prev) => ({ ...prev, [fieldId]: value }));
                }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-4">
            <Link
              to={`/app/requirements/${id}`}
              className="px-6 py-3 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> 保存中...</span>
              ) : '保存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
