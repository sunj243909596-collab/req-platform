import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Sparkles, CheckCircle, AlertTriangle, Lightbulb, Loader2, Wand2, Eye, Pencil } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { createRequirement, getModuleOptions, type CreateRequirementInput, type Priority, type ReqType } from '../../../api/requirements';
import { CategoryTreeSelect } from '../../components/CategoryTreeSelect';
import { listRequirementCategories } from '../../../api/categories';
import { analyzeRequirementDraft, generateDesignSolution, type AnalysisResult } from '../../../api/agent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listGroups, type GroupInfo } from '../../../api/groups';
import { listCustomFields, type CustomField } from '../../../api/settings';
import { CustomFieldsForm } from '../../components/CustomFieldsForm';
import { listRequirementTypes } from '../../../api/req-types';
import { getNumberRule } from '../../../api/number-rule';
import type { RequirementTypeItem } from 'shared-types';
import { authStore } from '../../../stores/auth';

type DesignMode = 'text' | 'markdown';
type Step = 'form' | 'analysis';

export function CreateRequirement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetCategoryId = searchParams.get('categoryId');
  const [step, setStep] = useState<Step>('form');
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [generatingDesign, setGeneratingDesign] = useState(false);
  const [designMode, setDesignMode] = useState<DesignMode>('text');
  const [designPreview, setDesignPreview] = useState(false);
  const [moduleOptions, setModuleOptions] = useState<string[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [reqTypes, setReqTypes] = useState<RequirementTypeItem[]>([]);
  const [numberRuleEnabled, setNumberRuleEnabled] = useState(false);
  const [selectedCategoryNode, setSelectedCategoryNode] = useState<{ code: string | null; parentId: number | null; name: string } | null>(null);
  const currentUser = authStore.currentUser;

  const [form, setForm] = useState({
    title: '',
    categoryId: '' as number | '',
    reqType: 'REQUIREMENT',
    priority: 'P1' as Priority,
    module: '',
    assignee: '',
    releaseId: undefined as number | undefined,
    targetDate: '',
    tags: '',
    background: '',
    description: '',
    designSolution: '',
    groupName: currentUser?.groupName || '',
  });

  useEffect(() => { getModuleOptions().then(setModuleOptions).catch(() => {}); }, []);
  useEffect(() => {
    listRequirementTypes()
      .then((types) => {
        setReqTypes(types);
        // 默认选第一个启用类型（如无则用 form 初始的 'REQUIREMENT'）
        setForm((f) => f.reqType ? f : { ...f, reqType: types[0]?.code ?? f.reqType });
      })
      .catch(() => setReqTypes([]));
  }, []);

  useEffect(() => {
    getNumberRule(form.reqType).then((r) => setNumberRuleEnabled(r.enabled)).catch(() => setNumberRuleEnabled(false));
  }, [form.reqType]);

  useEffect(() => {
    listGroups().then((gs) => {
      setGroups(gs);
      if (!form.groupName && gs.length > 0) {
        setForm((f) => ({ ...f, groupName: gs[0].groupName }));
      }
    }).catch(() => {});

    listRequirementCategories().then((tree) => {
      const preset = presetCategoryId ? parseInt(presetCategoryId, 10) : NaN;
      const pickDefault = () => {
        const root = tree.find((t) => t.reqType === 'REQUIREMENT');
        return root ? { categoryId: root.id, reqType: root.reqType } : {};
      };
      const findNode = (
        nodes: typeof tree,
        id: number
      ): { categoryId: number; reqType: string } | null => {
        for (const n of nodes) {
          if (n.id === id && n.enabled) return { categoryId: n.id, reqType: n.reqType };
          const child = findNode(n.children, id);
          if (child) return child;
        }
        return null;
      };
      setForm((f) => {
        if (f.categoryId) return f;
        if (!Number.isNaN(preset)) {
          const hit = findNode(tree, preset);
          if (hit) return { ...f, ...hit };
        }
        return { ...f, ...pickDefault() };
      });
    }).catch(() => {});
  }, [presetCategoryId]);

  // Load global custom fields on mount
  useEffect(() => {
    listCustomFields()
      .then((fields) => {
        setCustomFields(fields);
        setCustomFieldValues({});
      })
      .catch(() => setCustomFields([]));
  }, []);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!form.title.trim()) { toast.error('请输入需求标题'); return false; }
    if (!form.description.trim()) { toast.error('请输入需求描述'); return false; }
    if (!form.categoryId) { toast.error('请选择需求分类'); return false; }
    // 启用自定义编码规则时，子分类必须有 code
    if (numberRuleEnabled) {
      if (selectedCategoryNode && !selectedCategoryNode.code) {
        const msg = selectedCategoryNode.parentId
          ? `自定义编码已启用，子分类「${selectedCategoryNode.name}」的 code 不能为空`
          : `自定义编码已启用，根分类「${selectedCategoryNode.name}」的 code 不能为空`;
        toast.error(msg);
        return false;
      }
    }
    return true;
  };

  /** Step 1: AI 分析（不创建） */
  const handleAnalyze = async () => {
    if (!validateForm()) return;
    setAnalyzing(true);
    try {
      // Use the analysis API with the form data (without creating the requirement yet)
      // Since analyzeRequirement requires a reqId, we do a temporary approach:
      // call the agent's analyze endpoint via a temporary draft
      const result = await analyzeRequirementDraft({
        title: form.title.trim(),
        description: form.description.trim(),
        module: form.module || undefined,
        terminals: undefined,
        relatedTables: undefined,
      });
      setAnalysisResult(result);
      setStep('analysis');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  /** Step 2: 用户确认保存 → 创建需求 */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const input: CreateRequirementInput = {
        reqType: form.reqType as ReqType,
        title: form.title.trim(),
        categoryId: form.categoryId as number,
        priority: form.priority,
        module: form.module || undefined,
        assignee: form.assignee || undefined,
        releaseId: form.releaseId,
        targetDate: form.targetDate || undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        background: form.background || undefined,
        description: form.description.trim(),
        designSolution: form.designSolution || undefined,
        groupName: form.groupName,
        customValues: Object.entries(customFieldValues)
          .filter(([, v]) => v !== '' && v !== undefined)
          .map(([fieldId, value]) => ({ fieldId: parseInt(fieldId, 10), value })),
      };

      const req = await createRequirement(input);
      toast.success('需求创建成功！');
      navigate(`/app/requirements/${req.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** AI 生成设计方案 */
  const handleGenerateDesign = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('请先填写需求标题和描述');
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

  return (
    <div className="p-6">
      <div className="max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/app/requirements"
            className="inline-flex items-center gap-2 text-[var(--primary)] hover:underline mb-4"
          >
            <ArrowLeft size={18} />
            返回需求列表
          </Link>
          <h2 className="mb-2">创建需求</h2>
          <p className="text-[var(--ink-muted-80)]">
            {step === 'form' && '填写需求信息，AI 助手将分析并提供建议'}
            {step === 'analysis' && 'AI 分析完成，确认无误后保存需求'}
          </p>
        </div>

        {/* ============= Step 1: Form ============= */}
        {step === 'form' && (
          <>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 mb-6">
                <div className="space-y-6">
                  {/* Type & Category & Priority */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block mb-2 text-[var(--ink)]">需求类型 *</label>
                      <select
                        value={form.reqType}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setForm((prev) => ({ ...prev, reqType: nextType, categoryId: '' }));
                          setSelectedCategoryNode(null);
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
                      <label className="block mb-2 text-[var(--ink)]">需求分类 *</label>
                      <CategoryTreeSelect
                        value={form.categoryId}
                        reqType={form.reqType}
                        excludeRoot
                        onChange={(categoryId, _reqType, fullNode) => {
                          setForm((prev) => ({ ...prev, categoryId }));
                          setSelectedCategoryNode(fullNode ? { code: fullNode.code ?? null, parentId: fullNode.parentId ?? null, name: fullNode.name } : null);
                        }}
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
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">需求标题 *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      placeholder="例如：支持扫码入库功能"
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

                  {/* Group selector */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">所属组 *</label>
                    {currentUser?.role === 'ADMIN' ? (
                      <select
                        value={form.groupName}
                        onChange={(e) => handleChange('groupName', e.target.value)}
                        className="w-full max-w-xs px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.groupName}>{g.groupName}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="px-4 py-3 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] max-w-xs">
                        {form.groupName || '未分配组'}
                      </div>
                    )}
                  </div>

                  {/* Target Date */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">期望日期</label>
                    <input
                      type="date"
                      value={form.targetDate}
                      onChange={(e) => handleChange('targetDate', e.target.value)}
                      className="w-full max-w-xs px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">标签</label>
                    <input
                      type="text"
                      value={form.tags}
                      onChange={(e) => handleChange('tags', e.target.value)}
                      placeholder="输入标签，用逗号分隔（如：GSP, 追溯）"
                      className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>

                  {/* Background */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">需求背景</label>
                    <textarea
                      value={form.background}
                      onChange={(e) => handleChange('background', e.target.value)}
                      placeholder="描述需求产生的背景和原因..."
                      className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                      rows={3}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block mb-2 text-[var(--ink)]">需求描述 *</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => handleChange('description', e.target.value)}
                      placeholder="详细描述需求的功能和要求..."
                      className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                      rows={5}
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
            </form>

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <Link
                to="/app/requirements"
                className="px-6 py-3 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
              >
                取消
              </Link>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-6 py-3 border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-pill)] hover:bg-[var(--primary)] hover:text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {analyzing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {analyzing ? 'AI 分析中...' : 'AI 分析'}
              </button>
            </div>
          </>
        )}

        {/* ============= Step 2: AI Analysis Results ============= */}
        {step === 'analysis' && analysisResult && (
          <div className="space-y-6">
            {/* Feasibility */}
            {analysisResult.feasibility && (
              <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
                <h4 className="flex items-center gap-2 mb-4 text-[var(--ink)]">
                  <CheckCircle size={18} className="text-emerald-500" />
                  可行性评估
                </h4>
                <div className="flex items-center gap-4 mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    analysisResult.feasibility.feasible
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {analysisResult.feasibility.feasible ? '可行' : '存在风险'}
                  </span>
                  <span className="text-sm text-[var(--ink-muted-80)]">
                    置信度: {analysisResult.feasibility.confidence}/10
                  </span>
                  <span className="text-sm text-[var(--ink-muted-80)]">
                    预估工时: {analysisResult.feasibility.estimatedEffortDays}
                  </span>
                </div>
                <p className="text-[var(--ink-muted-80)] mb-4 whitespace-pre-wrap">{analysisResult.feasibility.summary}</p>
                {analysisResult.feasibility.risks.length > 0 && (
                  <div>
                    <h5 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-1">
                      <AlertTriangle size={14} /> 风险点
                    </h5>
                    <ul className="space-y-1">
                      {analysisResult.feasibility.risks.map((r, i) => (
                        <li key={i} className="text-sm text-[var(--ink-muted-80)] flex items-start gap-2">
                          <span className="text-amber-500 mt-1">•</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Solution */}
            {analysisResult.solution && (
              <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
                <h4 className="flex items-center gap-2 mb-4 text-[var(--ink)]">
                  <Lightbulb size={18} className="text-amber-500" />
                  实现方案建议
                </h4>
                <p className="text-[var(--ink-muted-80)] mb-3 whitespace-pre-wrap">{analysisResult.solution.overview}</p>
                {analysisResult.solution.approach && (
                  <p className="text-[var(--ink-muted-80)] mb-3 whitespace-pre-wrap">{analysisResult.solution.approach}</p>
                )}
                {analysisResult.solution.keyPoints.length > 0 && (
                  <ul className="space-y-1">
                    {analysisResult.solution.keyPoints.map((kp, i) => (
                      <li key={i} className="text-sm text-[var(--ink-muted-80)] flex items-start gap-2">
                        <span className="text-[var(--primary)] mt-1">•</span> {kp}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Similar Requirements */}
            {analysisResult.similarRequirements.length > 0 && (
              <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6">
                <h4 className="flex items-center gap-2 mb-4 text-[var(--ink)]">
                  <Sparkles size={18} className="text-[var(--primary)]" />
                  相似需求（{analysisResult.similarRequirements.length}）
                </h4>
                <div className="space-y-2">
                  {analysisResult.similarRequirements.slice(0, 8).map((sr) => (
                    <div key={sr.reqId} className="flex items-center justify-between p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm text-[var(--primary)] shrink-0">{sr.reqNo}</span>
                        <span className="text-sm text-[var(--ink)] truncate">{sr.title}</span>
                        <span className="px-2 py-0.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-full text-xs text-[var(--ink-muted-80)] shrink-0">
                          {sr.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="w-16 h-1.5 bg-[var(--canvas)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${sr.similarity * 100}%`,
                              backgroundColor: sr.similarity > 0.7 ? '#ef4444' : sr.similarity > 0.5 ? '#f59e0b' : '#3b82f6',
                            }}
                          />
                        </div>
                        <span className="text-xs text-[var(--ink-muted-80)] font-mono">{(sr.similarity * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicate Warning */}
            {analysisResult.potentialDuplicates.length > 0 && (
              <div className="bg-amber-50 rounded-[var(--radius-lg)] border border-amber-200 p-6">
                <h4 className="flex items-center gap-2 mb-4 text-amber-600">
                  <AlertTriangle size={18} />
                  疑似重复需求（{analysisResult.potentialDuplicates.length}）
                </h4>
                <div className="space-y-2">
                  {analysisResult.potentialDuplicates.map((dup) => (
                    <div key={dup.reqId} className="flex items-center justify-between p-3 bg-white rounded-[var(--radius-md)] border border-amber-200">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-sm text-[var(--primary)] shrink-0">{dup.reqNo}</span>
                        <span className="text-sm text-[var(--ink)] truncate">{dup.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-amber-600">{dup.reason}</span>
                        <span className="text-xs text-[var(--ink-muted-80)] font-mono">{(dup.similarity * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-4">
              <button
                onClick={() => { setStep('form'); setAnalysisResult(null); }}
                className="px-6 py-3 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
              >
                返回修改
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-8 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {submitting ? '创建中...' : '确认创建需求'}
              </button>
            </div>
          </div>
        )}

        {/* Analyzing Loading */}
        {analyzing && (
          <div className="bg-gradient-to-r from-[var(--primary)]/10 to-[var(--primary-on-dark)]/10 rounded-[var(--radius-lg)] border border-[var(--primary)]/20 p-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-[var(--primary)]/10 rounded-full">
                <Sparkles size={24} className="text-[var(--primary)] animate-pulse" />
              </div>
              <div className="flex-1">
                <h4 className="mb-2 text-[var(--ink)]">AI 正在分析需求...</h4>
                <div className="space-y-2 text-sm text-[var(--ink-muted-80)]">
                  <p>✓ 检索相似需求中...</p>
                  <p>✓ 分析可行性...</p>
                  <p>✓ 生成实现方案...</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
