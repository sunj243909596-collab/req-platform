import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Plus, Trash2, Edit2, Loader2, Search, X, Star, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listTeamLearnings,
  createTeamLearning,
  updateTeamLearning,
  deleteTeamLearning,
  getLearningStats,
  LEARNING_CATEGORY_LABELS,
  type TeamLearning,
  type LearningStats,
} from '../../../api/team-learnings';

const CATEGORIES = Object.keys(LEARNING_CATEGORY_LABELS);

const categoryColors: Record<string, string> = {
  '最佳实践': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  '踩坑记录': 'bg-red-100 text-red-700 border-red-200',
  '团队偏好': 'bg-blue-100 text-blue-700 border-blue-200',
  '架构决策': 'bg-purple-100 text-purple-700 border-purple-200',
};

export function TeamLearningSettings() {
  const [learnings, setLearnings] = useState<TeamLearning[]>([]);
  const [stats, setStats] = useState<LearningStats>({ total: 0, byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', content: '', category: '最佳实践', confidence: 7, tags: '' });

  const loadData = useCallback(() => {
    setLoading(true);
    const params: Record<string, string | number> = { page: 1, pageSize: 100 };
    if (activeCategory !== '全部') params.category = activeCategory;
    if (searchQuery.trim()) params.search = searchQuery.trim();

    Promise.all([listTeamLearnings(params), getLearningStats()])
      .then(([result, s]) => {
        setLearnings(result.data);
        setStats(s);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [activeCategory, searchQuery]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('标题不能为空'); return; }
    if (!form.category) { toast.error('请选择分类'); return; }
    try {
      if (editingId) {
        await updateTeamLearning(editingId, {
          title: form.title.trim(),
          content: form.content.trim() || undefined,
          category: form.category,
          confidence: form.confidence,
          tags: form.tags ? { text: form.tags } : undefined,
        });
        toast.success('经验已更新');
      } else {
        await createTeamLearning({
          title: form.title.trim(),
          content: form.content.trim() || undefined,
          category: form.category,
          confidence: form.confidence,
          tags: form.tags ? { text: form.tags } : undefined,
        });
        toast.success('经验已添加');
      }
      setShowModal(false);
      setEditingId(null);
      setForm({ title: '', content: '', category: '最佳实践', confidence: 7, tags: '' });
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleEdit = (item: TeamLearning) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content || '',
      category: item.category,
      confidence: item.confidence,
      tags: item.tags?.text as string || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`确定要删除"${title}"吗？`)) return;
    try {
      await deleteTeamLearning(id);
      toast.success('经验已删除');
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const renderStars = (confidence: number) => {
    return Array.from({ length: 10 }, (_, i) => (
      <Star
        key={i}
        size={12}
        className={i < confidence ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
      />
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[var(--ink)] flex items-center gap-2">
            <BookOpen size={20} /> 团队经验
          </h3>
          <p className="text-sm text-[var(--ink-muted-80)] mt-1">
            共 {stats.total} 条经验，沉淀团队开发过程中的模式、陷阱与决策
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm({ title: '', content: '', category: '最佳实践', confidence: 7, tags: '' });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95 text-sm"
        >
          <Plus size={16} /> 添加经验
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setActiveCategory('全部')}
          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
            activeCategory === '全部'
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
          }`}
        >
          全部 ({stats.total})
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
              activeCategory === cat
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--canvas-parchment)] text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
            }`}
          >
            {LEARNING_CATEGORY_LABELS[cat]} ({stats.byCategory[cat] || 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索经验标题..."
          className="w-full pl-9 pr-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
        </div>
      ) : learnings.length === 0 ? (
        <div className="text-center py-16 text-[var(--ink-muted-80)]">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="mb-2">暂无经验记录</p>
          <p className="text-sm">点击"添加经验"记录团队开发中的模式、陷阱与决策</p>
        </div>
      ) : (
        <div className="space-y-3">
          {learnings.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${categoryColors[item.category] || 'bg-gray-100 text-gray-700'}`}>
                      {LEARNING_CATEGORY_LABELS[item.category] || item.category}
                    </span>
                    <span className="text-sm font-medium text-[var(--ink)] truncate">{item.title}</span>
                  </div>
                  {item.content && (
                    <p className="text-sm text-[var(--ink-muted-80)] whitespace-pre-wrap mt-1">{item.content}</p>
                  )}
                  {typeof item.tags?.text === 'string' && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-[var(--ink-muted-48)]">
                      <Tag size={12} />
                      <span>{item.tags.text}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-[var(--ink-muted-48)]">
                    <span>{item.author}</span>
                    <span>{item.createdAt?.slice(0, 10)}</span>
                    <span className="flex items-center gap-0.5">{renderStars(item.confidence)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(item)}
                    className="p-1.5 text-[var(--ink-muted-48)] hover:text-[var(--primary)] rounded transition-colors"
                    title="编辑"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id, item.title)}
                    className="p-1.5 text-[var(--ink-muted-48)] hover:text-[var(--destructive)] rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[var(--ink)]">{editingId ? '编辑经验' : '添加经验'}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-[var(--ink-muted-48)] hover:text-[var(--ink)] rounded transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block mb-1.5 text-sm text-[var(--ink)]">标题 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                  placeholder="一句话描述这条经验"
                  autoFocus
                />
              </div>

              {/* Category */}
              <div>
                <label className="block mb-1.5 text-sm text-[var(--ink)]">分类</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: cat }))}
                      className={`px-3 py-2 rounded-[var(--radius-md)] text-sm font-medium text-left transition-colors border ${
                        form.category === cat
                          ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                          : 'bg-[var(--canvas)] text-[var(--ink)] border-[var(--hairline)] hover:border-[var(--primary)]'
                      }`}
                    >
                      {LEARNING_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block mb-1.5 text-sm text-[var(--ink)]">详细内容</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm resize-none"
                  rows={4}
                  placeholder="描述具体场景、解决方案或注意事项..."
                />
              </div>

              {/* Confidence */}
              <div>
                <label className="block mb-1.5 text-sm text-[var(--ink)]">
                  信心值: {form.confidence}/10
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={form.confidence}
                  onChange={(e) => setForm((f) => ({ ...f, confidence: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-[var(--ink-muted-80)]">
                  <span>存疑 1</span><span>确定 10</span>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block mb-1.5 text-sm text-[var(--ink)]">标签（可选）</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
                  placeholder="如：Oracle, MyBatis, 前端"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)] text-sm"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] text-sm"
              >
                {editingId ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
