import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, FileText, ExternalLink, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RagRetrievalMeta } from '../../api/agent';
import { getKbFileContent } from '../../api/settings';
import { highlightWmTables } from '../../utils/highlightWmTables';
import { toast } from 'sonner';

const ROUTING_METHOD_LABEL: Record<string, string> = {
  llm: 'LLM 路由',
  heuristic: '关键词路由',
  single: '单库',
  configured: '指定库',
  default: '默认库',
};

export function RagSourcesPanel({ meta }: { meta: RagRetrievalMeta }) {
  const [open, setOpen] = useState(true);
  const [viewingFile, setViewingFile] = useState<{ path: string; name: string } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  const rerankLabel =
    meta.rerankMethod === 'llm' ? 'LLM 语义重排' : '启发式重排（去重+多样性）';

  const tableNames = meta.groundedTableNames ?? [];

  const handleViewFile = async (relativePath: string, fileName: string) => {
    setViewingFile({ path: relativePath, name: fileName });
    setFileLoading(true);
    setFileContent(null);
    try {
      const result = await getKbFileContent(relativePath);
      setFileContent(result.content);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载文件失败');
      setViewingFile(null);
    } finally {
      setFileLoading(false);
    }
  };

  return (
    <>
      <div className="mt-3 border border-[var(--hairline)] rounded-[var(--radius-md)] bg-[var(--canvas-parchment)] text-left overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ink)] hover:bg-[var(--canvas)] transition-colors"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Database size={14} className="text-[var(--primary)]" />
          <span>本次知识库检索（{meta.sources.length} 条片段）</span>
        </button>

        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-[var(--hairline)]">
            <p className="text-xs text-[var(--ink-muted-80)] pt-2 leading-relaxed">
              <span className="font-medium text-[var(--ink)]">检索范围：</span>
              {meta.routing.labels.join('、')}
              <br />
              <span className="font-medium text-[var(--ink)]">说明：</span>
              {meta.routing.reason}
              <span className="mx-1">·</span>
              路由：{ROUTING_METHOD_LABEL[meta.routing.method] ?? meta.routing.method}
              <span className="mx-1">·</span>
              重排：{rerankLabel}
            </p>

            {tableNames.length > 0 && (
              <div className="p-2 rounded-[var(--radius-sm)] bg-[var(--canvas)] border border-[var(--primary)]/30">
                <p className="text-xs font-medium text-[var(--ink)] mb-1.5">
                  片段中出现的表名（回答应只使用下列名称）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tableNames.map((name) => (
                    <code
                      key={name}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] font-mono"
                    >
                      {name}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <ul className="space-y-2 max-h-[280px] overflow-y-auto">
              {meta.sources.map((s, i) => (
                <li
                  key={`${s.fileName}-${i}`}
                  className="p-2 rounded-[var(--radius-sm)] bg-[var(--canvas)] border border-[var(--hairline)]"
                >
                  <div className="flex items-start gap-2">
                    <FileText size={13} className="text-[var(--primary)] mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        {s.relativePath ? (
                          <button
                            onClick={() => handleViewFile(s.relativePath!, s.fileName)}
                            className="font-medium text-[var(--primary)] hover:underline flex items-center gap-1"
                          >
                            {s.fileName}
                            <ExternalLink size={10} />
                          </button>
                        ) : (
                          <span className="font-medium text-[var(--ink)]">{s.fileName}</span>
                        )}
                        {s.section && (
                          <span className="text-[var(--ink-muted-80)]">{s.section}</span>
                        )}
                        <span className="text-[var(--primary)] tabular-nums">
                          相似度 {s.similarity.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--ink-muted-80)] leading-relaxed line-clamp-4">
                        {highlightWmTables(s.preview)}
                        {s.preview.length >= 300 ? '…' : ''}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <p className="text-[10px] text-[var(--ink-muted-80)]">
              高亮为检索片段中的表名。点击文件名可查看完整文件内容。
            </p>
          </div>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="bg-[var(--canvas)] rounded-[var(--radius-lg)] w-full max-w-3xl mx-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--ink)] flex items-center gap-2">
                  <FileText size={16} className="text-[var(--primary)]" />
                  {viewingFile.name}
                </h3>
                <p className="text-xs text-[var(--ink-muted-48)] mt-0.5 font-mono">{viewingFile.path}</p>
              </div>
              <button onClick={() => setViewingFile(null)} className="text-[var(--ink-muted-48)] hover:text-[var(--ink)]">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {fileLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                </div>
              ) : fileContent ? (
                <div className="text-[var(--ink)] leading-relaxed">
                  <ReactMarkdown
                    skipHtml
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-xl font-bold text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-3 mt-4">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-semibold text-[var(--ink)] border-b border-[var(--hairline)] pb-1 mb-2 mt-4">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-semibold text-[var(--ink)] mt-3 mb-1.5">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-sm font-semibold text-[var(--ink)] mt-2 mb-1">{children}</h4>,
                      p: ({ children }) => <p className="text-[var(--ink-muted-80)] leading-relaxed mb-2">{children}</p>,
                      code: ({ className, children }) => {
                        const isInline = !className;
                        return isInline
                          ? <code className="px-1.5 py-0.5 bg-[var(--canvas-parchment)] text-[var(--primary)] rounded text-xs font-mono">{children}</code>
                          : <div className="overflow-x-auto my-2"><code className="block p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] text-xs font-mono leading-relaxed">{children}</code></div>;
                      },
                      pre: ({ children }) => <pre className="p-0 m-0">{children}</pre>,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-3">
                          <table className="min-w-full border-collapse border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden text-sm">{children}</table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-[var(--canvas-parchment)]">{children}</thead>,
                      tbody: ({ children }) => <tbody className="divide-y divide-[var(--hairline)]">{children}</tbody>,
                      tr: ({ children }) => <tr className="border-b border-[var(--hairline)] last:border-b-0">{children}</tr>,
                      th: ({ children }) => <th className="px-3 py-2 border-r border-[var(--hairline)] text-xs font-semibold text-[var(--ink)] text-left whitespace-nowrap">{children}</th>,
                      td: ({ children }) => <td className="px-3 py-2 border-r border-[var(--hairline)] text-xs text-[var(--ink-muted-80)]">{children}</td>,
                      ul: ({ children }) => <ul className="list-disc list-inside text-[var(--ink-muted-80)] space-y-0.5 mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside text-[var(--ink-muted-80)] space-y-0.5 mb-2">{children}</ol>,
                      blockquote: ({ children }) => <blockquote className="border-l-3 border-[var(--primary)] pl-3 text-[var(--ink-muted-80)] italic mb-2">{children}</blockquote>,
                      hr: () => <hr className="border-[var(--hairline)] my-3" />,
                      li: ({ children }) => <li className="text-[var(--ink-muted-80)] mb-0.5">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
                    }}
                  >
                    {fileContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-center py-12 text-[var(--ink-muted-48)]">加载失败</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
