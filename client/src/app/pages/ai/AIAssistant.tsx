import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Search, FileText, Link2, TrendingUp, Loader2, MessageSquare, Plus, ChevronLeft, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  streamChat,
  sendChat,
  getConversations,
  getConversationMessages,
  deleteConversation,
  type RagRetrievalMeta,
  type ConversationInfo,
} from '../../../api/agent';
import { RagSourcesPanel } from '../../components/RagSourcesPanel';
import { toast } from 'sonner';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  ragMeta?: RagRetrievalMeta;
};

export function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '你好！我是AI助手，可以帮助你分析需求、检测重复、生成方案建议。请问有什么可以帮助你的？',
    },
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Conversation history
  const [conversations, setConversations] = useState<ConversationInfo[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [convLoading, setConvLoading] = useState(true);

  // Load conversation list — extracted so we can call it from multiple places
  const loadConversations = () => {
    getConversations()
      .then((data) => {
        setConversations(data);
        setConvLoading(false);
      })
      .catch((err) => {
        console.error("加载对话列表失败:", err);
        setConvLoading(false);
      });
  };

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Refresh conversation list when conversationId changes
  useEffect(() => {
    if (conversationId) {
      loadConversations();
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = async (convId: number) => {
    setLoadingConversation(true);
    try {
      const msgs = await getConversationMessages(convId);
      setMessages(
        msgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m, idx) => ({
            id: `${convId}-${idx}-${m.role}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            thinking: (m.metadata as Record<string, unknown>)?.thinking as string | undefined,
            ragMeta: m.metadata?.rag,
          }))
      );
      setConversationId(convId);
    } catch {
      // silently fail
    } finally {
      setLoadingConversation(false);
    }
  };

  const handleDeleteConversation = async (convId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation(convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (conversationId === convId) {
        handleNewChat();
      }
      toast.success('对话已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  const handleNewChat = () => {
    setMessages([{
      id: '1',
      role: 'assistant',
      content: '你好！我是AI助手，可以帮助你分析需求、检测重复、生成方案建议。请问有什么可以帮助你的？',
    }]);
    setConversationId(undefined);
  };

  const quickActions = [
    { icon: Search, label: '相似需求检索', prompt: '帮我检索与"扫码入库"相似的历史需求' },
    { icon: FileText, label: '方案生成', prompt: '为"批量导入供应商信息"生成技术实现方案' },
    { icon: Link2, label: '依赖分析', prompt: '分析REQ-001的依赖关系' },
    { icon: TrendingUp, label: '排期建议', prompt: '给出V2.3.0的排期建议' },
  ];

  const handleSendMessage = (content: string) => {
    if (!content.trim() || isThinking) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: content.trim(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    // Use streaming for real-time response
    const aiMsgId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: aiMsgId, role: 'assistant', content: '' }]);

    abortRef.current = streamChat(
      { conversationId, message: content.trim() },
      (token) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + token } : m))
        );
      },
      (convId) => {
        setConversationId(convId);
        loadConversations(); // force refresh after message sent
        setIsThinking(false);
        abortRef.current = null;
      },
      (err, streamConvId) => {
        // Fallback to non-streaming — keep isThinking until fallback resolves
        // Use streamConvId from the start event so we don't create a duplicate conversation
        abortRef.current = null;
        const effectiveConvId = streamConvId ?? conversationId;
        sendChat({ conversationId: effectiveConvId, message: content.trim() })
          .then((res) => {
            setConversationId(res.conversationId);
            loadConversations();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: res.message.content }
                  : m
              )
            );
            setIsThinking(false);
          })
          .catch(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? { ...m, content: `抱歉，请求出错了：${err.message}` }
                  : m
              )
            );
            setIsThinking(false);
          });
      },
      (ragMeta) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, ragMeta } : m))
        );
      },
      (thinking) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, thinking: (m.thinking || '') + thinking } : m))
        );
      }
    );
  };

  const handleQuickAction = (prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <div className="h-[calc(100vh-var(--nav-height,48px))] flex bg-[var(--canvas-parchment)]">
      {/* Conversation Sidebar */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} border-r border-[var(--hairline)] bg-[var(--canvas)]/95 backdrop-blur-sm overflow-y-auto transition-all duration-200 flex-shrink-0 shadow-[var(--shadow-card)]`}>
        <div className="p-3 border-b border-[var(--hairline)]">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors text-sm"
          >
            <Plus size={16} /> 新建对话
          </button>
        </div>
        <div className="p-2 space-y-1">
          {convLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[var(--primary)]" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-[var(--ink-muted-80)] text-center py-4">暂无历史对话</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className="group relative"
              >
                <button
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-[var(--radius-md)] transition-colors ${
                    conversationId === conv.id
                      ? 'bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="text-sm truncate">{conv.title || '未命名对话'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--ink-muted-80)]">{conv.messageCount} 条消息</span>
                    <span className="text-xs text-[var(--ink-muted-80)]">{conv.updatedAt?.slice(0, 10)}</span>
                  </div>
                </button>
                {/* Delete button - shown on hover */}
                <button
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                  className="absolute top-2 right-2 p-1 text-[var(--ink-muted-80)] hover:text-[var(--destructive)] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="删除对话"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b border-[var(--hairline)] bg-[var(--canvas)]/90 backdrop-blur-md flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] transition-colors"
            title={showSidebar ? '收起侧边栏' : '展开侧边栏'}
          >
            <ChevronLeft size={18} className={`text-[var(--ink-muted-80)] transition-transform ${showSidebar ? '' : 'rotate-180'}`} />
          </button>
          <div className="p-2 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-on-dark)] rounded-[var(--radius-md)]">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ink)]">AI 智能助手</h2>
            <p className="text-xs text-[var(--ink-muted-80)]">基于知识库的智能分析</p>
          </div>
        </div>

      {/* Quick Actions */}
      <div className="p-6 bg-[var(--canvas-parchment)] border-b border-[var(--hairline)]">
        <div className="max-w-[1200px] mx-auto">
          <h4 className="mb-4 text-[var(--ink)]">快速操作</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isThinking}
                className="flex items-center gap-3 p-4 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-lg)] hover:border-[var(--primary)] hover:shadow-md transition-all text-left disabled:opacity-50"
              >
                <div className="p-2 bg-[var(--primary)]/10 rounded-[var(--radius-md)]">
                  <action.icon size={20} className="text-[var(--primary)]" />
                </div>
                <span className="text-sm font-medium text-[var(--ink)]">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto bg-[var(--canvas-parchment)]">
        <div className="max-w-[1200px] mx-auto p-6 space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-on-dark)] rounded-full flex items-center justify-center">
                  <Sparkles size={18} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-[var(--radius-lg)] p-4 ${
                  message.role === 'user'
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)]'
                }`}
              >
                {message.ragMeta && message.role === 'assistant' && (
                  <RagSourcesPanel meta={message.ragMeta} />
                )}
                {message.thinking && message.role === 'assistant' && (
                  <ThinkingBlock thinking={message.thinking} isStreaming={isThinking && !message.content} />
                )}
                {message.content ? (
                  message.role === 'assistant' ? (
                    <div className={`text-[var(--ink)] leading-relaxed ${message.ragMeta ? 'mt-3' : ''}`}>
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
                          a: ({ href, children }) => <a href={href} className="text-[var(--primary)] hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                          hr: () => <hr className="border-[var(--hairline)] my-3" />,
                          li: ({ children }) => <li className="text-[var(--ink-muted-80)] mb-0.5">{children}</li>,
                          strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  )
                ) : (
                  <p className="leading-relaxed">
                    <span className="inline-flex items-center gap-1 text-[var(--ink-muted-48)]">
                      <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-[var(--primary)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </p>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-10 h-10 flex-shrink-0 bg-[var(--ink)] rounded-full flex items-center justify-center text-white font-semibold">
                  我
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-4 justify-start">
              <div className="w-10 h-10 flex-shrink-0 bg-gradient-to-br from-[var(--primary)] to-[var(--primary-on-dark)] rounded-full flex items-center justify-center">
                <Loader2 size={18} className="text-white animate-spin" />
              </div>
              <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-lg)] p-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.1s]" />
                  <div className="w-2 h-2 bg-[var(--primary)] rounded-full animate-bounce [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="p-6 bg-[var(--canvas)] border-t border-[var(--hairline)]">
        <div className="max-w-[1200px] mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="flex gap-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题或需求..."
              className="flex-1 px-6 py-4 bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-pill)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              disabled={isThinking}
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              className="px-8 py-4 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send size={18} /> <span>发送</span>
            </button>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Thinking Block (collapsible reasoning display) ──

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming: boolean }) {
  const [collapsed, setCollapsed] = useState(!isStreaming);

  return (
    <div className="mt-2 mb-2 border border-[var(--hairline)] rounded-[var(--radius-md)] bg-amber-50/50 overflow-hidden text-left">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100/50 transition-colors"
      >
        <span className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}>▸</span>
        <span>{isStreaming ? '思考中…' : '已深度思考'}</span>
        {!isStreaming && <span className="text-amber-400 ml-auto">{thinking.length} 字</span>}
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 border-t border-amber-200/50">
          <div className="text-xs text-amber-800/70 leading-relaxed whitespace-pre-wrap mt-2 max-h-48 overflow-y-auto">
            {thinking}
          </div>
        </div>
      )}
    </div>
  );
}
