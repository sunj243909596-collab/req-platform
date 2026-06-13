import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAgentConfig,
  updateAgentConfig,
  testAgentConnection,
  type AgentConfig,
  type LlmProvider,
} from '../../../api/settings';

import { authStore } from '../../../stores/auth';

function useAuthUser() {
  const [user, setUser] = useState(authStore.currentUser);
  useEffect(() => {
    if (!authStore.currentUser) void authStore.fetchUser();
    return authStore.subscribe(setUser);
  }, []);
  return user;
}

export function AISettings() {
  const user = useAuthUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showEmbedKey, setShowEmbedKey] = useState(false);

  const [form, setForm] = useState({
    llmProvider: 'anthropic' as LlmProvider,
    llmModel: '',
    llmApiKey: '',
    llmBaseUrl: '',
    embeddingModel: '',
    embeddingApiKey: '',
    embeddingBaseUrl: '',
    maxTokens: 4096,
    temperature: 0.7,
    autoAnalysis: true,
    chatEnabled: true,
    planningSuggestions: true,
    llmApiKeyMasked: '',
    embeddingApiKeyMasked: '',
  });

  useEffect(() => {
    getAgentConfig()
      .then((cfg) => {
        setForm({
          llmProvider: cfg.llmProvider as LlmProvider,
          llmModel: cfg.llmModel,
          llmApiKey: '',
          llmBaseUrl: cfg.llmBaseUrl || '',
          embeddingModel: cfg.embeddingModel,
          embeddingApiKey: '',
          embeddingBaseUrl: cfg.embeddingBaseUrl || '',
          maxTokens: cfg.maxTokens,
          temperature: cfg.temperature,
          autoAnalysis: cfg.features.autoAnalysis,
          chatEnabled: cfg.features.chatEnabled,
          planningSuggestions: cfg.features.planningSuggestions,
          llmApiKeyMasked: cfg.llmApiKeyMasked || '',
          embeddingApiKeyMasked: cfg.embeddingApiKeyMasked || '',
        });
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载配置失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateAgentConfig({
        llmProvider: form.llmProvider,
        llmModel: form.llmModel,
        llmBaseUrl: form.llmBaseUrl || undefined,
        ...(form.llmApiKey ? { llmApiKey: form.llmApiKey } : {}),
        embeddingModel: form.embeddingModel,
        embeddingBaseUrl: form.embeddingBaseUrl || undefined,
        ...(form.embeddingApiKey ? { embeddingApiKey: form.embeddingApiKey } : {}),
        maxTokens: form.maxTokens,
        temperature: form.temperature,
        features: {
          autoAnalysis: form.autoAnalysis,
          chatEnabled: form.chatEnabled,
          planningSuggestions: form.planningSuggestions,
        },
      });
      setForm((f) => ({
        ...f,
        llmApiKey: '',
        embeddingApiKey: '',
        llmApiKeyMasked: updated.llmApiKeyMasked || '',
        embeddingApiKeyMasked: updated.embeddingApiKeyMasked || '',
      }));
      toast.success('配置已保存，即时生效');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAgentConnection({
        llmProvider: form.llmProvider,
        llmModel: form.llmModel,
        llmApiKey: form.llmApiKey || undefined,
        llmBaseUrl: form.llmBaseUrl || undefined,
      });
      setTestResult(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const PROVIDER_PRESETS: Record<string, { model: string; baseUrl: string; placeholder: string }> = {
    anthropic: { model: 'claude-sonnet-4-20250514', baseUrl: '', placeholder: 'https://api.anthropic.com (默认)' },
    openai:    { model: 'gpt-4o', baseUrl: '', placeholder: 'https://api.openai.com (默认)' },
    ollama:    { model: 'qwen3:8b', baseUrl: 'http://localhost:11434', placeholder: 'http://localhost:11434' },
    custom:    { model: '', baseUrl: '', placeholder: '例如：https://my-proxy.example.com' },
  };

  const handleProviderChange = (provider: string) => {
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
    setForm((f) => ({
      ...f,
      llmProvider: provider as typeof f.llmProvider,
      llmModel: f.llmModel || preset.model,
      llmBaseUrl: preset.baseUrl,
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  const currentPreset = PROVIDER_PRESETS[form.llmProvider] || PROVIDER_PRESETS.custom;

  return (
    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] p-6 space-y-6">
      <h3 className="text-[var(--ink)]">AI 设置</h3>

      {/* ── LLM Provider Section ── */}
      <div className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-lg)] space-y-4">
        <h4 className="text-sm font-semibold text-[var(--ink)]">大语言模型（LLM）</h4>

        <div className="grid grid-cols-2 gap-3">
          {Object.entries({
            anthropic: 'Anthropic (Claude)',
            openai: 'OpenAI / 兼容接口',
            ollama: 'Ollama (本地)',
            custom: '自定义端点',
          }).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => handleProviderChange(val)}
              className={`px-4 py-3 rounded-[var(--radius-md)] text-sm font-medium text-left transition-colors border ${
                form.llmProvider === val
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-[var(--canvas)] text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">模型名称</label>
          <input
            type="text"
            value={form.llmModel}
            onChange={(e) => setForm((f) => ({ ...f, llmModel: e.target.value }))}
            placeholder={currentPreset.model || '输入模型名称'}
            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">
            API 端点 URL
            {form.llmProvider !== 'custom' && (
              <span className="ml-2 text-xs text-[var(--ink-muted-80)]">（留空使用默认）</span>
            )}
            {form.llmProvider === 'custom' && (
              <span className="ml-2 text-xs text-[var(--destructive)]">必填</span>
            )}
          </label>
          <input
            type="text"
            value={form.llmBaseUrl}
            onChange={(e) => setForm((f) => ({ ...f, llmBaseUrl: e.target.value }))}
            placeholder={currentPreset.placeholder}
            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
          />
          {form.llmProvider === 'ollama' && (
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">Ollama 使用 OpenAI 兼容接口，路径自动补全 /v1</p>
          )}
          {form.llmProvider === 'custom' && (
            <p className="mt-1 text-xs text-[var(--ink-muted-80)]">支持任何 OpenAI 兼容的接口（如 LM Studio、vLLM、Azure OpenAI 等）</p>
          )}
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">API Key</label>
          <div className="flex gap-2">
            <input
              type={showLlmKey ? 'text' : 'password'}
              value={form.llmApiKey}
              onChange={(e) => setForm((f) => ({ ...f, llmApiKey: e.target.value }))}
              placeholder={form.llmApiKeyMasked || '输入新 Key（留空保持不变）'}
              className="flex-1 px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowLlmKey(!showLlmKey)}
              className="px-3 py-3 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] transition-colors"
            >
              {showLlmKey ? '隐藏' : '显示'}
            </button>
          </div>
          {form.llmApiKeyMasked && !form.llmApiKey && (
            <p className="mt-1 text-xs text-[#28a745]">✓ 已配置 Key：{form.llmApiKeyMasked}</p>
          )}
        </div>
      </div>

      {/* ── Embedding Section ── */}
      <div className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-lg)] space-y-4">
        <h4 className="text-sm font-semibold text-[var(--ink)]">向量嵌入模型（Embedding）</h4>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">模型名称</label>
          <input
            type="text"
            value={form.embeddingModel}
            onChange={(e) => setForm((f) => ({ ...f, embeddingModel: e.target.value }))}
            placeholder="text-embedding-3-small"
            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">
            Embedding 端点 URL
            <span className="ml-2 text-xs text-[var(--ink-muted-80)]">（留空使用 OpenAI 默认）</span>
          </label>
          <input
            type="text"
            value={form.embeddingBaseUrl}
            onChange={(e) => setForm((f) => ({ ...f, embeddingBaseUrl: e.target.value }))}
            placeholder="https://api.openai.com（默认）"
            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
          />
        </div>

        <div>
          <label className="block mb-1.5 text-sm text-[var(--ink)]">Embedding API Key</label>
          <div className="flex gap-2">
            <input
              type={showEmbedKey ? 'text' : 'password'}
              value={form.embeddingApiKey}
              onChange={(e) => setForm((f) => ({ ...f, embeddingApiKey: e.target.value }))}
              placeholder={form.embeddingApiKeyMasked || '输入新 Key（留空保持不变）'}
              className="flex-1 px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowEmbedKey(!showEmbedKey)}
              className="px-3 py-3 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] transition-colors"
            >
              {showEmbedKey ? '隐藏' : '显示'}
            </button>
          </div>
          {form.embeddingApiKeyMasked && !form.embeddingApiKey && (
            <p className="mt-1 text-xs text-[#28a745]">✓ 已配置 Key：{form.embeddingApiKeyMasked}</p>
          )}
        </div>
      </div>

      {/* ── Inference Parameters ── */}
      <div className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-lg)] space-y-4">
        <h4 className="text-sm font-semibold text-[var(--ink)]">推理参数</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">温度 ({form.temperature})</label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.temperature}
              onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-[var(--ink-muted-80)]">
              <span>精确 0</span><span>创造 1</span>
            </div>
          </div>
          <div>
            <label className="block mb-1.5 text-sm text-[var(--ink)]">最大 Token 数</label>
            <input
              type="number" min="512" max="32768"
              value={form.maxTokens}
              onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) }))}
              className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>
      </div>

      {/* Feature Toggles */}
      {[
        { key: 'autoAnalysis' as const, label: '自动分析', desc: '创建需求后自动调用AI进行分析' },
        { key: 'chatEnabled' as const, label: 'AI聊天', desc: '启用智能对话功能' },
        { key: 'planningSuggestions' as const, label: '排期建议', desc: '自动提供排期建议和依赖分析' },
      ].map(({ key, label, desc }) => (
        <div key={key} className="flex items-center justify-between p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
          <div>
            <div className="font-medium text-[var(--ink)] mb-1">{label}</div>
            <div className="text-sm text-[var(--ink-muted-80)]">{desc}</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[var(--hairline)] peer-checked:bg-[var(--primary)] rounded-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
          </label>
        </div>
      ))}

      {/* Test Connection */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTestConnection}
          disabled={testing}
          className="flex items-center gap-2 px-6 py-3 border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          <span>测试连接</span>
        </button>
        {testResult && (
          <span className={`text-sm flex items-center gap-1 ${testResult.ok ? 'text-[#28a745]' : 'text-[var(--destructive)]'}`}>
            {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {testResult.message}
          </span>
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
    </div>
  );
}
