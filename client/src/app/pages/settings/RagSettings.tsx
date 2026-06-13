import { useState, useEffect } from 'react';
import {
  Loader2, Search, FileCode, Route, Sparkles, RotateCcw, Play,
  ChevronDown, ChevronRight, Database, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getAgentConfig,
  updateAgentConfig,
  getDefaultKbRoutingPrompt,
  optimizeKbRoutingPrompt,
  getSystemPromptDefaults,
  optimizeSystemPrompt,
  SYSTEM_PROMPT_LABELS,
  listKnowledgeBases,
  createKnowledgeBase,
  rebuildRequirementKb,
  type SystemPromptConfigKey,
  type KnowledgeBaseStatus,
} from '../../../api/settings';
import {
  testKbRouting,
  type KbRoutingTestResult,
} from '../../../api/settings';
import { KB_DOC_TYPE_OPTIONS } from 'shared-types';

import { authStore } from '../../../stores/auth';
import { ConfirmDialog } from '../../components/ConfirmDialog';

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

const PRIMARY_PROMPT_KEYS: SystemPromptConfigKey[] = ['chat', 'ragCitationSuffix'];
const ADVANCED_PROMPT_KEYS: SystemPromptConfigKey[] = [
  'requirementAnalysis',
  'requirementAssistant',
  'releasePlanning',
  'solutionGeneration',
];

function buildSystemPromptsPatch(
  texts: Record<string, string>,
  customFlags: Record<string, boolean>,
  defaults: Record<SystemPromptConfigKey, string>
): Record<SystemPromptConfigKey, string | null> {
  const out = {} as Record<SystemPromptConfigKey, string | null>;
  for (const key of Object.keys(defaults) as SystemPromptConfigKey[]) {
    out[key] = customFlags[key] ? texts[key]?.trim() || null : null;
  }
  return out;
}

function RouteTestResultPanel({
  result,
  showCatalog,
  onToggleCatalog,
}: {
  result: KbRoutingTestResult;
  showCatalog: boolean;
  onToggleCatalog: () => void;
}) {
  const ROUTING_METHOD_LABEL: Record<string, string> = {
    llm: 'LLM 路由',
    heuristic: '关键词路线',
    single: '单库',
    configured: '指定库',
    default: '默认库',
    docType: 'docType 硬过滤',
  };
  return (
    <div className="p-3 rounded-[var(--radius-md)] bg-[var(--canvas-parchment)] border border-[var(--hairline)] text-sm space-y-2">
      <p>
        <span className="font-medium text-[var(--ink)]">选中库：</span>
        {result.labels.length > 0 ? result.labels.join('、') : '（无）'}
        <span className="text-xs text-[var(--ink-muted-80)] ml-2 font-mono">
          id={result.kbIds.join(', ')}
        </span>
      </p>
      <p className="text-[var(--ink-muted-80)]">
        <span className="font-medium text-[var(--ink)]">说明：</span>
        {result.reason}
        <span className="mx-1">·</span>
        {ROUTING_METHOD_LABEL[result.method] ?? result.method}
      </p>
      {result.catalogPreview && (
        <div>
          <button
            type="button"
            onClick={onToggleCatalog}
            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
          >
            {showCatalog ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            查看送入 LLM 的库列表（catalog）
          </button>
          {showCatalog && (
            <pre className="mt-2 p-2 text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-sm)]">
              {result.catalogPreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function RagSettings() {
  const user = useAuthUser();
  const isAdmin = user?.role === 'ADMIN';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [defaultKbRoutingPrompt, setDefaultKbRoutingPrompt] = useState('');
  const [kbRoutingPromptCustom, setKbRoutingPromptCustom] = useState(false);
  const [routeTestQuery, setRouteTestQuery] = useState('');
  const [routeTestLoading, setRouteTestLoading] = useState(false);
  const [routeTestResult, setRouteTestResult] = useState<KbRoutingTestResult | null>(null);
  const [showCatalogPreview, setShowCatalogPreview] = useState(false);
  const [promptDefaults, setPromptDefaults] = useState<Record<SystemPromptConfigKey, string>>(
    {} as Record<SystemPromptConfigKey, string>
  );
  const [activePromptKey, setActivePromptKey] = useState<SystemPromptConfigKey>('chat');
  const [systemPromptTexts, setSystemPromptTexts] = useState<Record<string, string>>({});
  const [systemPromptCustom, setSystemPromptCustom] = useState<Record<string, boolean>>({});
  const [optimizingSystemPrompt, setOptimizingSystemPrompt] = useState(false);
  const [showAdvancedPrompts, setShowAdvancedPrompts] = useState(false);

  const [form, setForm] = useState({
    ragTopK: 15,
    ragContextMaxTokens: 12000,
    ragChatTemperature: 0.1,
    ragChunkMaxCharsMd: 3000,
    ragChunkMaxCharsText: 2000,
    ragChunkRetrievalChars: 6000,
    ragSimilarityThreshold: 0.58,
    ragVectorCandidateMultiplier: 3,
    ragChunkOverlapMd: 200,
    ragSearchDocType: '',
    ragSearchPathPrefix: '',
    kbRoutingEnabled: true,
    kbRoutingMaxKb: 2,
    ragDocTypeStrict: false,
    llmRerankEnabled: false,
    llmRerankCandidateK: 20,
    kbRoutingSystemPrompt: '',
  });
  const [kbs, setKbs] = useState<KnowledgeBaseStatus[]>([]);
  const [showCreateKb, setShowCreateKb] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ indexed: number; failed: number } | null>(null);
  const [newKb, setNewKb] = useState({
    name: '',
    displayName: '',
    description: '',
    docType: 'REQUIREMENT_LIST' as string,
    basePath: 'uploads/kb/custom',
    sourceType: 'directory' as 'directory' | 'upload',
    enabled: true,
  });

  useEffect(() => {
    Promise.all([
      getAgentConfig(),
      getDefaultKbRoutingPrompt(),
      getSystemPromptDefaults(),
      listKnowledgeBases(),
    ])
      .then(([cfg, def, promptDef, kbList]) => {
        setKbs(kbList);
        setDefaultKbRoutingPrompt(def.default);
        setPromptDefaults(promptDef.defaults);
        const customFlags: Record<string, boolean> = {};
        const texts: Record<string, string> = {};
        for (const key of Object.keys(promptDef.defaults) as SystemPromptConfigKey[]) {
          const custom = cfg.systemPrompts?.[key]?.trim();
          customFlags[key] = !!custom;
          texts[key] = custom || promptDef.defaults[key];
        }
        setSystemPromptCustom(customFlags);
        setSystemPromptTexts(texts);
        const rag = (cfg as any).rag || {};
        const custom = cfg.kbRoutingSystemPrompt?.trim();
        setKbRoutingPromptCustom(!!custom);
        setForm({
          ragTopK: rag.topK ?? 15,
          ragContextMaxTokens: rag.contextMaxTokens ?? 12000,
          ragChatTemperature: rag.chatTemperature ?? 0.1,
          ragChunkMaxCharsMd: rag.chunkMaxCharsMd ?? 3000,
          ragChunkMaxCharsText: rag.chunkMaxCharsText ?? 2000,
          ragChunkRetrievalChars: rag.chunkRetrievalChars ?? 6000,
          ragSimilarityThreshold: rag.similarityThreshold ?? 0.58,
          ragVectorCandidateMultiplier: rag.vectorCandidateMultiplier ?? 3,
          ragChunkOverlapMd: rag.chunkOverlapMd ?? 200,
          ragSearchDocType: rag.searchDocType ?? '',
          ragSearchPathPrefix: rag.searchPathPrefix ?? '',
          kbRoutingEnabled: rag.kbRoutingEnabled !== false,
          kbRoutingMaxKb: rag.kbRoutingMaxKb ?? 2,
          ragDocTypeStrict: rag.ragDocTypeStrict === true,
          llmRerankEnabled: rag.llmRerankEnabled === true,
          llmRerankCandidateK: rag.llmRerankCandidateK ?? 20,
          kbRoutingSystemPrompt: custom || def.default,
        });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载配置失败'))
      .finally(() => setLoading(false));
  }, []);

  const runRouteTest = async () => {
    const q = routeTestQuery.trim();
    if (!q) return;
    setRouteTestLoading(true);
    setRouteTestResult(null);
    try {
      const result = await testKbRouting(q);
      setRouteTestResult(result);
      setShowCatalogPreview(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '路由测试失败');
    } finally {
      setRouteTestLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAgentConfig({
        rag: {
          topK: form.ragTopK,
          contextMaxTokens: form.ragContextMaxTokens,
          chatTemperature: form.ragChatTemperature,
          chunkMaxCharsMd: form.ragChunkMaxCharsMd,
          chunkMaxCharsText: form.ragChunkMaxCharsText,
          similarityThreshold: form.ragSimilarityThreshold,
          vectorCandidateMultiplier: form.ragVectorCandidateMultiplier,
          chunkOverlapMd: form.ragChunkOverlapMd,
          searchDocType: form.ragSearchDocType || null,
          searchPathPrefix: form.ragSearchPathPrefix || null,
          kbRoutingEnabled: form.kbRoutingEnabled,
          kbRoutingMaxKb: form.kbRoutingMaxKb,
          ragDocTypeStrict: form.ragDocTypeStrict,
          llmRerankEnabled: form.llmRerankEnabled,
          llmRerankCandidateK: form.llmRerankCandidateK,
        },
        ...(isAdmin
          ? {
              kbRoutingSystemPrompt: kbRoutingPromptCustom
                ? form.kbRoutingSystemPrompt.trim() || null
                : null,
              systemPrompts: buildSystemPromptsPatch(
                systemPromptTexts,
                systemPromptCustom,
                promptDefaults
              ),
            }
          : {}),
      });
      toast.success('配置已保存，即时生效');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleRebuildRequirementKb = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const r = await rebuildRequirementKb();
      setRebuildResult({ indexed: r.indexed, failed: r.failed });
      if (r.failed === 0) {
        toast.success(`需求列表 RAG 重建完成：${r.indexed} 条已索引`);
      } else {
        toast.warning(`重建完成但有 ${r.failed} 条失败,查看控制台日志`);
      }
      // 刷新 KB 列表显示新 chunk 数
      try {
        const refreshed = await listKnowledgeBases();
        setKbs(refreshed);
      } catch {/* 列表刷新失败不影响主流程 */}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重建失败');
    } finally {
      setRebuilding(false);
      setRebuildOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 space-y-6">
      <h3 className="text-[var(--ink)]">RAG 设置</h3>

      {/* ── RAG Retrieval Config ── */}
      <div className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-lg)] space-y-4">
        <h4 className="text-sm font-semibold text-[var(--ink)]">
          <Search size={16} className="inline mr-1" /> RAG 检索配置
        </h4>

        <div className="grid grid-cols-2 gap-4">
          {/* topK */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">返回结果数 (topK)</label>
            <input
              type="number" min="1" max="50"
              value={form.ragTopK}
              onChange={(e) => setForm((f) => ({ ...f, ragTopK: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">每次知识库检索返回的 chunk 数（经 rerank 后）</p>
          </div>

          {/* similarityThreshold */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">相似度阈值 ({form.ragSimilarityThreshold})</label>
            <input
              type="range" min="0.4" max="0.85" step="0.01"
              value={form.ragSimilarityThreshold}
              onChange={(e) => setForm((f) => ({ ...f, ragSimilarityThreshold: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">向量检索低于此值的 chunk 不进入上下文，建议 0.55–0.65</p>
          </div>

          {/* vectorCandidateMultiplier */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">向量候选倍数</label>
            <input
              type="number" min="2" max="10"
              value={form.ragVectorCandidateMultiplier}
              onChange={(e) => setForm((f) => ({ ...f, ragVectorCandidateMultiplier: parseInt(e.target.value) || 3 }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">先召回 topK×N 条再过滤与 rerank</p>
          </div>

          {/* contextMaxTokens */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">上下文最大 Token 数</label>
            <input
              type="number" min="2000" max="32000" step="1000"
              value={form.ragContextMaxTokens}
              onChange={(e) => setForm((f) => ({ ...f, ragContextMaxTokens: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">注入 prompt 的知识库内容上限</p>
          </div>

          {/* chatTemperature */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">问答温度 ({form.ragChatTemperature})</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.ragChatTemperature}
              onChange={(e) => setForm((f) => ({ ...f, ragChatTemperature: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[var(--ink-muted-80)]">
              <span>确定性 0</span><span>创造性 1</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">知识库问答的温度，建议 0.1-0.3</p>
          </div>

          {/* chunkOverlapMd */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">Markdown 分块重叠</label>
            <input
              type="number" min="0" max="800" step="50"
              value={form.ragChunkOverlapMd}
              onChange={(e) => setForm((f) => ({ ...f, ragChunkOverlapMd: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">长章节切分时保留上下文字符数，建议 150–300</p>
          </div>

          {/* searchDocType */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">默认文档类型过滤</label>
            <input
              type="text"
              value={form.ragSearchDocType}
              onChange={(e) => setForm((f) => ({ ...f, ragSearchDocType: e.target.value }))}
              placeholder="如 design、code（留空=全部）"
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* searchPathPrefix */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">默认路径前缀过滤</label>
            <input
              type="text"
              value={form.ragSearchPathPrefix}
              onChange={(e) => setForm((f) => ({ ...f, ragSearchPathPrefix: e.target.value }))}
              placeholder="如 设计文档/（留空=全部）"
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">相对知识库根目录；API 可用 pathPrefix 覆盖</p>
          </div>

          {/* chunkMaxCharsMd */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">Markdown 分块大小</label>
            <input
              type="number" min="500" max="10000" step="500"
              value={form.ragChunkMaxCharsMd}
              onChange={(e) => setForm((f) => ({ ...f, ragChunkMaxCharsMd: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">按 ## 标题分块，超出时按段落切分</p>
          </div>

          {/* chunkMaxCharsText */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">纯文本分块大小</label>
            <input
              type="number" min="500" max="10000" step="500"
              value={form.ragChunkMaxCharsText}
              onChange={(e) => setForm((f) => ({ ...f, ragChunkMaxCharsText: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">纯文本按段落分块，超出时滑动窗口</p>
          </div>

          {/* chunkRetrievalChars */}
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">检索返回截断长度</label>
            <input
              type="number" min="1000" max="20000" step="1000"
              value={form.ragChunkRetrievalChars}
              onChange={(e) => setForm((f) => ({ ...f, ragChunkRetrievalChars: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">检索时单个 chunk 返回的最大字符数。调大可避免大字段表被截断（如 ASN 176 字段），但会增加 token 消耗</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--ink-muted-80)]">
          <FileCode size={14} />
          <span>修改后保存即时生效（同步新文档时使用新分块大小）</span>
        </div>
      </div>

      {/* ── System Prompts ── */}
      <div className="p-4 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ink)]">对话回答提示词</h5>
            <p className="text-xs text-[var(--ink-muted-80)] mt-1">
              控制 AI 如何基于检索结果作答；与下方「路由提示词」职责分离，勿混写选库逻辑。
            </p>
          </div>
          {!isAdmin && (
            <span className="text-xs text-[var(--ink-muted-80)]">仅管理员可编辑</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-[var(--ink)]">编辑片段</label>
          <select
            value={activePromptKey}
            onChange={(e) => setActivePromptKey(e.target.value as SystemPromptConfigKey)}
            className="px-3 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas)]"
          >
            {PRIMARY_PROMPT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SYSTEM_PROMPT_LABELS[k]}
              </option>
            ))}
            {showAdvancedPrompts &&
              ADVANCED_PROMPT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SYSTEM_PROMPT_LABELS[k]}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAdvancedPrompts((v) => !v)}
            className="text-xs text-[var(--primary)] hover:underline"
          >
            {showAdvancedPrompts ? '收起高级场景' : '更多场景…'}
          </button>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={optimizingSystemPrompt}
              onClick={async () => {
                setOptimizingSystemPrompt(true);
                try {
                  const { optimized } = await optimizeSystemPrompt(
                    activePromptKey,
                    systemPromptCustom[activePromptKey]
                      ? systemPromptTexts[activePromptKey]
                      : null
                  );
                  setSystemPromptTexts((t) => ({ ...t, [activePromptKey]: optimized }));
                  setSystemPromptCustom((c) => ({ ...c, [activePromptKey]: true }));
                  toast.success('已生成优化稿，请确认后保存');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : '优化失败');
                } finally {
                  setOptimizingSystemPrompt(false);
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50"
            >
              {optimizingSystemPrompt ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              LLM 优化
            </button>
            <button
              type="button"
              onClick={() => {
                const def = promptDefaults[activePromptKey];
                if (def) {
                  setSystemPromptTexts((t) => ({ ...t, [activePromptKey]: def }));
                  setSystemPromptCustom((c) => ({ ...c, [activePromptKey]: false }));
                  toast.info('已恢复默认，保存后生效');
                }
              }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas)]"
            >
              <RotateCcw size={14} />
              恢复默认
            </button>
          </div>
        )}

        <textarea
          value={systemPromptTexts[activePromptKey] ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setSystemPromptTexts((t) => ({ ...t, [activePromptKey]: v }));
            setSystemPromptCustom((c) => ({ ...c, [activePromptKey]: true }));
          }}
          readOnly={!isAdmin}
          rows={activePromptKey === 'ragCitationSuffix' ? 12 : 10}
          className={`w-full px-4 py-3 border border-[var(--hairline)] rounded-[var(--radius-md)] font-mono text-xs leading-relaxed resize-y ${
            isAdmin
              ? 'bg-[var(--canvas)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]'
              : 'bg-[var(--canvas)] text-[var(--ink-muted-80)] cursor-not-allowed'
          }`}
        />
        <p className="text-xs text-[var(--ink-muted-80)]">
          {SYSTEM_PROMPT_LABELS[activePromptKey]}
          {systemPromptCustom[activePromptKey] ? '（自定义）' : '（内置默认）'}
          {activePromptKey !== 'ragCitationSuffix' &&
            ' · 保存后仍会附加 RAG 引用规则片段（除非你也自定义了「RAG 引用与表名约束」）'}
        </p>
      </div>

      {/* ── KB Routing ── */}
      <div className="p-4 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Route size={16} />
              知识库智能选库
            </h5>
            <p className="text-xs text-[var(--ink-muted-80)] mt-1">
              对话/分析前由 LLM 根据问题与各库说明选定 1～N 个库再检索；关闭后仅用默认知识库。
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={form.kbRoutingEnabled}
              onChange={(e) => setForm((f) => ({ ...f, kbRoutingEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="text-sm text-[var(--ink)]">docType 严格过滤</label>
            <p className="text-xs text-[var(--mid)] mt-0.5">
              开启后，AI 对话选 docType 时只走对应 KB，不经过 LLM 路由
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, ragDocTypeStrict: !f.ragDocTypeStrict }))}
            disabled={!isAdmin}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              form.ragDocTypeStrict ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                form.ragDocTypeStrict ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        {form.kbRoutingEnabled && (
          <>
            <div className="max-w-xs">
              <label className="block mb-1.5 text-sm text-[var(--ink)]">单次最多检索库数</label>
              <input
                type="number"
                min={1}
                max={5}
                value={form.kbRoutingMaxKb}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    kbRoutingMaxKb: Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 2)),
                  }))
                }
                className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
              <p className="mt-1 text-xs text-[var(--ink-muted-80)]">
                多库场景建议 1～2；值越大召回越全但越慢
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-sm font-medium text-[var(--ink)]">路由系统提示词</label>
                {!isAdmin && (
                  <span className="text-xs text-[var(--ink-muted-80)]">仅管理员可编辑</span>
                )}
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={optimizingPrompt}
                      onClick={async () => {
                        setOptimizingPrompt(true);
                        try {
                          const { optimized } = await optimizeKbRoutingPrompt(
                            kbRoutingPromptCustom ? form.kbRoutingSystemPrompt : null
                          );
                          setForm((f) => ({ ...f, kbRoutingSystemPrompt: optimized }));
                          setKbRoutingPromptCustom(true);
                          toast.success('已生成优化稿，请确认后保存');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : '优化失败');
                        } finally {
                          setOptimizingPrompt(false);
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50"
                    >
                      {optimizingPrompt ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      LLM 优化
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          kbRoutingSystemPrompt: defaultKbRoutingPrompt,
                        }));
                        setKbRoutingPromptCustom(false);
                        toast.info('已恢复默认提示词，保存后生效');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas)]"
                    >
                      <RotateCcw size={14} />
                      恢复默认
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={form.kbRoutingSystemPrompt}
                onChange={(e) => {
                  setForm((f) => ({ ...f, kbRoutingSystemPrompt: e.target.value }));
                  setKbRoutingPromptCustom(true);
                }}
                readOnly={!isAdmin}
                rows={10}
                className={`w-full px-4 py-3 border border-[var(--hairline)] rounded-[var(--radius-md)] font-mono text-xs leading-relaxed resize-y ${
                  isAdmin
                    ? 'bg-[var(--canvas)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]'
                    : 'bg-[var(--canvas)] text-[var(--ink-muted-80)] cursor-not-allowed'
                }`}
              />
              <p className="text-xs text-[var(--ink-muted-80)]">
                用于智能选库 LLM 调用的系统提示词；可使用占位符{' '}
                <code className="font-mono">{'{{maxKb}}'}</code> 表示单次最多库数。
                {kbRoutingPromptCustom ? '（当前为自定义）' : '（当前为内置默认）'}
              </p>
            </div>

            {/* Route Test */}
            <div className="border-t border-[var(--hairline)] pt-3 space-y-3">
              <h6 className="text-sm font-semibold text-[var(--ink)]">路由测试</h6>
              <p className="text-xs text-[var(--ink-muted-80)]">
                输入示例问题，预览将选中哪些知识库。修改提示词或库说明后请先保存再测试。
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={routeTestQuery}
                  onChange={(e) => setRouteTestQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !routeTestLoading && routeTestQuery.trim() && void runRouteTest()}
                  placeholder="如：WMOS 库存表有哪些？GSP 温湿度要求是什么？"
                  className="flex-1 px-4 py-2.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                <button
                  type="button"
                  disabled={routeTestLoading || !routeTestQuery.trim()}
                  onClick={() => void runRouteTest()}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-50 text-sm shrink-0"
                >
                  {routeTestLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  测试选库
                </button>
              </div>
              {routeTestResult && (
                <RouteTestResultPanel
                  result={routeTestResult}
                  showCatalog={showCatalogPreview}
                  onToggleCatalog={() => setShowCatalogPreview((v) => !v)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Knowledge Bases ── */}
      <div className="p-4 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Database size={16} />
              知识库
            </h5>
            <p className="text-xs text-[var(--ink-muted-80)] mt-1">
              管理 RAG 知识库及 docType；完整同步/上传请在「设置 → 知识库」页操作
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateKb(true)}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] bg-[var(--primary)] text-white hover:opacity-90"
            >
              + 新建知识库
            </button>
          )}
        </div>
        {kbs.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted-80)]">暂无知识库</p>
        ) : (
          <div className="space-y-2">
            {kbs.map((kb) => (
              <div
                key={kb.id}
                className="flex items-center justify-between gap-2 p-2 rounded-[var(--radius-md)] bg-[var(--canvas)] border border-[var(--hairline)] text-sm"
              >
                <div>
                  <span className="font-medium text-[var(--ink)]">{kb.displayName || kb.name}</span>
                  {kb.docType && (
                    <span className="ml-2 text-xs font-mono text-[var(--ink-muted-80)]">{kb.docType}</span>
                  )}
                </div>
                <span className="text-xs text-[var(--ink-muted-80)]">
                  {kb.chunkCount} chunks · {kb.enabled ? '启用' : '禁用'}
                </span>
              </div>
            ))}

        {/* ── Requirement KB Rebuild (历史数据补偿) ── */}
        <div className="mt-3 pt-3 border-t border-[var(--hairline)] space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[260px]">
              <h6 className="text-sm font-medium text-[var(--ink)] flex items-center gap-1.5">
                <RefreshCw size={14} />
                需求列表 RAG 重建
              </h6>
              <p className="text-xs text-[var(--ink-muted-80)] mt-1">
                将所有未删除的需求和发版重新同步到「需求列表与发版计划」知识库。
                <strong className="text-[var(--ink)]">历史数据补偿用</strong> —
                启动时已自动跑一次,新创建/修改的需求会自动同步,无需手动触发。
              </p>
              {rebuildResult && (
                <p className="text-xs mt-1.5 text-[var(--ink-muted-80)]">
                  上次结果:已索引 <span className="font-mono text-[var(--ink)]">{rebuildResult.indexed}</span> 条,
                  {rebuildResult.failed > 0 ? (
                    <span className="text-[var(--destructive)]">失败 {rebuildResult.failed} 条</span>
                  ) : (
                    <span className="text-[var(--success)]">无失败</span>
                  )}
                </p>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                disabled={rebuilding}
                onClick={() => setRebuildOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors disabled:opacity-50 shrink-0"
              >
                {rebuilding ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                立即重建
              </button>
            )}
          </div>
        </div>
          </div>
        )}
      </div>

      {showCreateKb && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowCreateKb(false)}
        >
          <div
            className="bg-white rounded-[var(--radius-lg)] p-6 w-[480px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">新建知识库</h3>
            <div className="space-y-3">
              <input
                placeholder="name (唯一标识)"
                value={newKb.name}
                onChange={(e) => setNewKb({ ...newKb, name: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
              <input
                placeholder="displayName (展示名)"
                value={newKb.displayName}
                onChange={(e) => setNewKb({ ...newKb, displayName: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
              <textarea
                placeholder="description"
                value={newKb.description}
                onChange={(e) => setNewKb({ ...newKb, description: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
              <select
                value={newKb.docType}
                onChange={(e) => setNewKb({ ...newKb, docType: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              >
                {KB_DOC_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={newKb.sourceType}
                onChange={(e) =>
                  setNewKb({ ...newKb, sourceType: e.target.value as 'directory' | 'upload' })
                }
                className="w-full px-3 py-2 border rounded"
              >
                <option value="directory">directory (服务器目录)</option>
                <option value="upload">upload (用户上传)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCreateKb(false)}
                className="px-4 py-2 text-sm rounded border"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  try {
                    if (!newKb.name.trim() || !newKb.displayName.trim()) {
                      toast.error('标识和展示名不能为空');
                      return;
                    }
                    await createKnowledgeBase({
                      name: newKb.name.trim(),
                      displayName: newKb.displayName.trim(),
                      description: newKb.description || undefined,
                      docType: newKb.docType,
                      basePath: newKb.basePath,
                      sourceType: newKb.sourceType,
                      enabled: newKb.enabled,
                    });
                    toast.success('已创建');
                    setShowCreateKb(false);
                    const refreshed = await listKnowledgeBases();
                    setKbs(refreshed);
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
                className="px-4 py-2 text-sm rounded bg-[var(--primary)] text-white"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LLM Rerank ── */}
      <div className="p-4 rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--canvas-parchment)] space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-sm font-semibold text-[var(--ink)]">LLM 语义重排</h5>
            <p className="text-xs text-[var(--ink-muted-80)] mt-1">
              向量/关键词召回后，由 LLM 按问题相关度对候选片段重新排序（比纯去重+轮询更准，会增加约 1～3 秒延迟）
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={form.llmRerankEnabled}
              onChange={(e) => setForm((f) => ({ ...f, llmRerankEnabled: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
        {form.llmRerankEnabled && (
          <div className="max-w-xs">
            <label className="block mb-1.5 text-sm text-[var(--ink)]">重排候选数（送入 LLM）</label>
            <input
              type="number"
              min={5}
              max={30}
              value={form.llmRerankCandidateK}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  llmRerankCandidateK: Math.min(30, Math.max(5, parseInt(e.target.value, 10) || 20)),
                }))
              }
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">建议 15～20；越大越准但越慢、耗 Token</p>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="pt-2 border-t border-[var(--hairline)]">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all disabled:opacity-50"
        >
          {saving && <Loader2 size={18} className="animate-spin" />}
          {saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      <ConfirmDialog
        isOpen={rebuildOpen}
        onClose={() => !rebuilding && setRebuildOpen(false)}
        onConfirm={() => void handleRebuildRequirementKb()}
        title="重建需求列表 RAG 知识库"
        description={`将重新索引所有未删除的需求与发版(预计 290+ 条)，每条生成 1 个结构化 Markdown chunk 并写入向量。期间 AI 对话对"需求列表"库的检索会暂时拿到旧/空数据。是否继续？`}
        confirmText={rebuilding ? '重建中…' : '开始重建'}
        cancelText="取消"
        variant="warning"
      />
    </div>
  );
}
