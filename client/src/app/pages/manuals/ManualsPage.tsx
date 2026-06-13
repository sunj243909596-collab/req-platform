// Manuals Page — documentation site style (same layout as HelpCenter)
// Left sidebar: category tree with admin actions
// Center: content area with article/document/link rendering
// Right sidebar: in-page TOC (for articles)

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  BookOpen, FileText, ExternalLink, Plus, Upload, Link2,
  Trash2, Edit2, Search, X, Eye, Pencil, Download,
  Loader2, Tag, ChevronRight, ChevronDown, Hash, Menu, ArrowUp,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import {
  listManuals, createManual, uploadManualDoc,
  updateManual, deleteManual, getManualDownloadUrl, getManualPreview,
  listCategories, createCategory, updateCategory, deleteCategory,
  MANUAL_TYPES, getCategoryColor,
  type OperationManual, type ManualPreview, type ManualCategory,
} from '../../../api/manuals';
import { authStore } from '../../../stores/auth';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const SIDEBAR_WIDTH = 260;
const TOC_WIDTH = 220;

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ==================== Markdown components ====================

// ReactMarkdown 在 React 18 下的 Components 类型与我们的 props 不兼容（pre-existing）
// 用 as any 跳过；功能正常
const mdComponents: any = {
  h1: (props: Record<string, unknown>) => <h1 className="text-2xl font-bold text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4 mt-0" {...props} />,
  h2: (props: Record<string, unknown>) => <h2 className="text-xl font-semibold text-[var(--ink)] border-b border-[var(--hairline)] pb-1 mb-3 mt-6" {...props} />,
  h3: (props: Record<string, unknown>) => <h3 className="text-lg font-semibold text-[var(--ink)] mt-4 mb-2" {...props} />,
  p: (props: Record<string, unknown>) => <p className="text-[var(--ink-muted-80)] leading-relaxed mb-3" {...props} />,
  ul: (props: Record<string, unknown>) => <ul className="list-disc list-inside text-[var(--ink-muted-80)] space-y-1 mb-3" {...props} />,
  ol: (props: Record<string, unknown>) => <ol className="list-decimal list-inside text-[var(--ink-muted-80)] space-y-1 mb-3" {...props} />,
  li: (props: Record<string, unknown>) => <li className="text-[var(--ink-muted-80)] mb-1" {...props} />,
  code: (props: { children?: React.ReactNode; className?: string }) => {
    const { className, children } = props;
    const isInline = !className;
    if (isInline) {
      return <code className="px-1 py-0.5 bg-[var(--canvas-parchment)] text-[var(--primary)] rounded text-sm font-mono" {...props} />;
    }
    return (
      <pre className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] overflow-auto text-sm font-mono my-3 border border-[var(--hairline)]">
        <code {...props} />
      </pre>
    );
  },
  table: (props: Record<string, unknown>) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden text-sm" {...props} />
    </div>
  ),
  thead: (props: Record<string, unknown>) => <thead className="bg-[var(--canvas-parchment)]" {...props} />,
  tbody: (props: Record<string, unknown>) => <tbody {...props} />,
  tr: (props: Record<string, unknown>) => <tr className="border-b border-[var(--hairline)] last:border-b-0" {...props} />,
  th: (props: Record<string, unknown>) => <th className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm font-semibold text-[var(--ink)] text-left bg-[var(--canvas-parchment)] whitespace-nowrap" {...props} />,
  td: (props: Record<string, unknown>) => <td className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm text-[var(--ink-muted-80)]" {...props} />,
  blockquote: (props: Record<string, unknown>) => <blockquote className="border-l-4 border-[var(--primary)] pl-4 text-[var(--ink-muted-80)] italic mb-3" {...props} />,
  a: (props: { href?: string; children?: React.ReactNode }) => <a className="text-[var(--primary)] hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
  hr: () => <hr className="border-[var(--hairline)] my-4" />,
};

// ==================== TOC extraction ====================

interface TocItem {
  id: string;
  title: string;
  level: number;
}

function extractToc(content: string): TocItem[] {
  const lines = content.split('\n');
  const items: TocItem[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      items.push({
        id: match[2].trim(),
        title: match[2].trim(),
        level: match[1].length - 1, // ## → 1, ### → 2
      });
    }
  }
  return items;
}

// ==================== Main Page ====================

export function ManualsPage() {
  const currentUser = authStore.currentUser;
  const isAdmin = currentUser?.role === 'ADMIN';

  // Data
  const [manuals, setManuals] = useState<OperationManual[]>([]);
  const [loading, setLoading] = useState(true);

  // View state: "list" = category landing, "article" = reading a specific manual
  const [viewMode, setViewMode] = useState<'list' | 'article'>('list');
  const [activeManual, setActiveManual] = useState<OperationManual | null>(null);
  const [activeContent, setActiveContent] = useState<ManualPreview | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activeType, setActiveType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tocItems, setTocItems] = useState<TocItem[]>([]);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: '', content: '', type: 'article' as string, category: '', tags: '', externalUrl: '',
  });
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Category management
  const [categories, setCategories] = useState<ManualCategory[]>([]);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);

  // UI
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const loadCategories = async () => {
    try {
      const cats = await listCategories();
      setCategories(cats);
    } catch { /* ignore */ }
  };

  const loadManuals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listManuals({
        category: activeCategory === '全部' ? undefined : activeCategory,
        type: activeType || undefined,
        search: searchQuery || undefined,
      });
      setManuals(data);
    } catch (err) {
      toast.error((err as Error).message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, activeType, searchQuery]);

  useEffect(() => { loadManuals(); loadCategories(); }, [loadManuals]);

  // Category counts
  const categoryCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of manuals) { counts[m.category] = (counts[m.category] || 0) + 1; }
    return counts;
  }, [manuals]);
  const totalCount = manuals.length;

  // Filtered by type/search
  const filteredManuals = useMemo(() => {
    let result = manuals;
    if (activeType) result = result.filter(m => m.type === activeType);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [manuals, activeType, searchQuery]);

  // Open an article/document for reading
  const openManual = async (manual: OperationManual) => {
    setActiveManual(manual);
    setViewMode('article');
    setTocItems([]);
    setContentLoading(true);
    setActiveContent(null);
    const requestId = ++previewRequestRef.current;
    try {
      const content = await getManualPreview(manual.id);
      if (previewRequestRef.current !== requestId) return;
      setActiveContent(content);
      // Extract TOC for markdown articles
      if (content.content && content.mimeType === 'text/markdown') {
        setTocItems(extractToc(content.content));
      }
    } catch (err) {
      if (previewRequestRef.current !== requestId) return;
      toast.error((err as Error).message || '加载预览失败');
    } finally {
      if (previewRequestRef.current === requestId) setContentLoading(false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    contentRef.current?.scrollTo({ top: 0 });
  };

  // Back to list
  const backToList = () => {
    setViewMode('list');
    setActiveManual(null);
    setActiveContent(null);
    setTocItems([]);
  };

  // Navigate to category
  const navigateToCategory = (catName: string) => {
    setActiveCategory(catName);
    setActiveType('');
    setSearchQuery('');
    backToList();
    setMobileSidebarOpen(false);
  };

  // ==================== Form handlers ====================

  const resetForm = () => {
    setForm({ title: '', content: '', type: 'article', category: '', tags: '', externalUrl: '' });
    setPreview(false); setEditingId(null);
  };

  const openCreateArticle = () => { resetForm(); setForm(f => ({ ...f, type: 'article' })); setShowForm(true); };
  const openCreateLink = () => { resetForm(); setForm(f => ({ ...f, type: 'link' })); setShowForm(true); };

  const openEdit = (manual: OperationManual) => {
    setForm({
      title: manual.title, content: manual.content || '', type: manual.type,
      category: manual.category, tags: manual.tags?.join(', ') || '', externalUrl: manual.externalUrl || '',
    });
    setEditingId(manual.id); setPreview(false); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('标题不能为空'); return; }
    if (form.type === 'link' && !form.externalUrl.trim()) { toast.error('外链类型必须填写 URL'); return; }
    setSaving(true);
    try {
      const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      if (editingId) {
        await updateManual(editingId, {
          title: form.title.trim(), content: form.content, category: form.category,
          tags, externalUrl: form.externalUrl,
        });
        toast.success('已更新');
      } else {
        await createManual({
          title: form.title.trim(), content: form.content, type: form.type,
          category: form.category, tags, externalUrl: form.externalUrl,
        });
        toast.success('已创建');
      }
      setShowForm(false); resetForm(); loadManuals();
    } catch (err) { toast.error((err as Error).message || '保存失败'); } finally { setSaving(false); }
  };

  // ==================== Upload handlers ====================

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) { setUploadFile(f); setUploadTitle(f.name.replace(/\.[^.]+$/, '')); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setUploadFile(f); setUploadTitle(f.name.replace(/\.[^.]+$/, '')); }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('请选择文件'); return; }
    setUploading(true);
    try {
      await uploadManualDoc({ file: uploadFile, title: uploadTitle || uploadFile.name, category: activeCategory === '全部' ? '未分类' : activeCategory });
      toast.success('文档已上传');
      setUploadFile(null); setUploadTitle('');
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      loadManuals();
    } catch (err) { toast.error((err as Error).message || '上传失败'); } finally { setUploading(false); }
  };

  // ==================== Delete handler ====================

  const handleDelete = async () => {
    if (confirmDelete == null) return;
    try {
      await deleteManual(confirmDelete);
      toast.success('已删除');
      setConfirmDelete(null);
      if (viewMode === 'article') backToList();
      loadManuals();
    } catch (err) { toast.error((err as Error).message || '删除失败'); }
  };

  // ==================== Category handlers ====================

  const handleAddCategory = async () => {
    if (!newCatName.trim()) { toast.error('分类名称不能为空'); return; }
    try {
      await createCategory(newCatName.trim());
      toast.success('分类已添加');
      setNewCatName(''); setShowAddCat(false);
      loadCategories();
    } catch (err) { toast.error((err as Error).message || '添加分类失败'); }
  };

  const handleUpdateCategory = async (id: number) => {
    if (!editCatName.trim()) { toast.error('分类名称不能为空'); return; }
    try {
      await updateCategory(id, editCatName.trim());
      toast.success('分类已更新');
      setEditingCatId(null); setEditCatName('');
      loadCategories();
    } catch (err) { toast.error((err as Error).message || '更新分类失败'); }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await deleteCategory(id);
      toast.success('分类已删除');
      if (activeCategory === categories.find(c => c.id === id)?.name) setActiveCategory('全部');
      loadCategories();
    } catch (err) { toast.error((err as Error).message || '删除分类失败'); }
  };

  const toggleEditCategory = (cat: ManualCategory) => {
    setEditingCatId(cat.id); setEditCatName(cat.name);
  };

  // ==================== Render: Article View ====================

  const renderArticleView = () => {
    if (!activeManual) return null;

    return (
      <div className="flex-1 min-w-0">
        <div className="max-w-[800px] mx-auto px-6 py-8 lg:px-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-muted-48)] mb-4">
            <button onClick={backToList} className="hover:text-[var(--primary)] transition-colors">
              操作手册
            </button>
            <ChevronRight size={12} />
            <button onClick={() => navigateToCategory(activeManual.category)} className="hover:text-[var(--primary)] transition-colors">
              {activeManual.category}
            </button>
            <ChevronRight size={12} />
            <span className="text-[var(--ink-muted-80)] font-medium truncate max-w-[200px]">
              {activeManual.title}
            </span>
          </div>

          {/* Title + Meta */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                activeManual.type === 'article' ? 'bg-blue-50 text-blue-700' :
                activeManual.type === 'document' ? 'bg-emerald-50 text-emerald-700' :
                'bg-purple-50 text-purple-700'
              }`}>
                {activeManual.type === 'article' ? <BookOpen size={12} /> :
                 activeManual.type === 'document' ? <FileText size={12} /> :
                 <ExternalLink size={12} />}
                {activeManual.type === 'article' ? '文章' :
                 activeManual.type === 'document' ? '文档' : '外链'}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getCategoryColor(activeManual.category)}`}>
                {activeManual.category}
              </span>
            </div>
            <h1 className="text-[26px] font-semibold text-[var(--ink)] leading-tight">{activeManual.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--ink-muted-48)]">
              <span>创建: {activeManual.createdBy}</span>
              <span>·</span>
              <span>{new Date(activeManual.createdAt).toLocaleDateString('zh-CN')}</span>
              {activeManual.updatedBy && activeManual.updatedBy !== activeManual.createdBy && (
                <>
                  <span>·</span>
                  <span>更新: {activeManual.updatedBy} · {new Date(activeManual.updatedAt).toLocaleDateString('zh-CN')}</span>
                </>
              )}
            </div>
            {activeManual.tags && activeManual.tags.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                {activeManual.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-[var(--canvas-parchment)] rounded text-xs text-[var(--ink-muted-60)]">
                    <Tag size={10} />{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="h-px bg-[var(--hairline)] my-5" />

          {/* Admin actions bar */}
          {isAdmin && (
            <div className="flex items-center gap-2 mb-6">
              <button type="button" onClick={() => openEdit(activeManual)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-pill)] text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:border-[var(--primary)]/40 transition-colors">
                <Edit2 size={12} /> 编辑
              </button>
              <button type="button" onClick={() => setConfirmDelete(activeManual.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--hairline)] rounded-[var(--radius-pill)] text-[var(--ink-muted-80)] hover:text-[var(--destructive)] hover:border-[var(--destructive)]/40 transition-colors">
                <Trash2 size={12} /> 删除
              </button>
            </div>
          )}

          {/* Content */}
          {contentLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
              <span className="ml-3 text-sm text-[var(--ink-muted-80)]">加载内容...</span>
            </div>
          )}

          {!contentLoading && activeContent && activeManual.type === 'article' && activeContent.content && (
            <div className="prose prose-sm max-w-none text-[var(--ink)] leading-relaxed">
              <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={mdComponents}>
                {activeContent.content}
              </ReactMarkdown>
            </div>
          )}

          {!contentLoading && activeContent && activeManual.type === 'document' && activeContent.mimeType === 'text/markdown' && activeContent.content && (
            <div className="space-y-4">
              <div className="prose prose-sm max-w-none text-[var(--ink)] leading-relaxed">
                <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {activeContent.content}
                </ReactMarkdown>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-[var(--hairline)]">
                <a href={getManualDownloadUrl(activeManual.id)} download={activeContent.fileName || undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-colors">
                  <Download size={14} /> 下载原文件
                </a>
              </div>
            </div>
          )}

          {!contentLoading && activeContent && activeManual.type === 'document' && activeContent.mimeType === 'text/html' && activeContent.content && (
            <div className="space-y-4">
              <div
                className="prose prose-sm max-w-none text-[var(--ink)] leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[var(--hairline)] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[var(--hairline)] [&_th]:px-3 [&_th]:py-2 [&_th]:bg-[var(--canvas-parchment)] [&_th]:font-semibold [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: activeContent.content }}
              />
              <div className="flex items-center gap-2 pt-4 border-t border-[var(--hairline)]">
                <a href={getManualDownloadUrl(activeManual.id)} download={activeContent.fileName || undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-colors">
                  <Download size={14} /> 下载原文件
                </a>
              </div>
            </div>
          )}

          {!contentLoading && activeContent && activeContent.isPdf && (
            <div className="space-y-4">
              <iframe src={getManualDownloadUrl(activeManual.id)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--hairline)]"
                style={{ height: '80vh' }} title={activeContent.fileName || 'PDF'} />
              <div className="flex justify-center">
                <a href={getManualDownloadUrl(activeManual.id)} download={activeContent.fileName || undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-colors">
                  <Download size={14} /> 下载原文件
                </a>
              </div>
            </div>
          )}

          {!contentLoading && activeContent && activeContent.mimeType === 'text/link' && (
            <div className="text-center py-12">
              <ExternalLink size={48} className="mx-auto mb-4 text-[var(--primary)] opacity-40" />
              <p className="text-[var(--ink-muted-80)] mb-4">外部链接</p>
              <a href={activeContent.externalUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm hover:bg-[var(--primary-focus)] transition-colors">
                <ExternalLink size={14} /> 打开链接
              </a>
            </div>
          )}

          {!contentLoading && activeContent?.message && !activeContent.content && (
            <div className="text-center py-12">
              <FileText size={48} className="mx-auto mb-4 text-[var(--primary)] opacity-40" />
              <p className="text-[var(--ink-muted-80)] mb-4">{activeContent.message}</p>
              <a href={getManualDownloadUrl(activeManual.id)} download={activeContent.fileName || undefined}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm hover:bg-[var(--primary-focus)] transition-colors">
                <Download size={14} /> 下载文件
              </a>
            </div>
          )}

          {!contentLoading && !activeContent && (
            <div className="text-center py-12 text-[var(--ink-muted-80)]">
              <p>无法加载内容</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ==================== Render: List View ====================

  const renderListView = () => (
    <div className="flex-1 min-w-0">
      <div className="max-w-[900px] mx-auto px-6 py-8 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[24px] font-semibold text-[var(--ink)] mb-1">
            {activeCategory === '全部' ? '全部手册' : activeCategory}
          </h1>
          <p className="text-[14px] text-[var(--ink-muted-80)]">
            共 {filteredManuals.length} 篇
            {activeType && ` · ${MANUAL_TYPES.find(t => t.value === activeType)?.label}`}
            {searchQuery && ` · 搜索 "${searchQuery}"`}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Type filter */}
          <div className="flex gap-1 bg-[var(--canvas)] rounded-[var(--radius-md)] p-1 border border-[var(--hairline)]">
            <button type="button" onClick={() => setActiveType('')}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${
                !activeType ? 'bg-white text-[var(--ink)] font-medium shadow-sm' : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
              }`}>
              全部类型
            </button>
            {MANUAL_TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setActiveType(t.value)}
                className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${
                  activeType === t.value ? 'bg-white text-[var(--ink)] font-medium shadow-sm' : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
            <input type="text" placeholder="搜索标题或标签..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-2 text-sm bg-white border border-[var(--hairline)] rounded-[var(--radius-pill)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)] hover:text-[var(--ink)]">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Upload zone — visible when a specific category is selected */}
        {isAdmin && activeCategory !== '全部' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-[var(--radius-md)] p-4 text-center transition-colors mb-6 ${
              dragOver ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--hairline)]'
            }`}
          >
            <input ref={uploadInputRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.md,.txt"
              onChange={handleFileSelect} className="hidden" id="manual-file-upload"
            />
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {uploadFile ? (
                <>
                  <FileText size={18} className="text-emerald-600 shrink-0" />
                  <span className="text-sm text-[var(--ink)] truncate max-w-[200px]">{uploadFile.name}</span>
                  <span className="text-xs text-[var(--ink-muted-60)]">{formatFileSize(uploadFile.size)}</span>
                  <button type="button" onClick={() => { setUploadFile(null); if (uploadInputRef.current) uploadInputRef.current.value = ''; }}
                    className="text-xs text-[var(--ink-muted-80)] hover:text-[var(--destructive)]">移除</button>
                  <button type="button" onClick={handleUpload} disabled={uploading}
                    className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-xs font-medium hover:bg-[var(--primary-focus)] disabled:opacity-50 flex items-center gap-1">
                    {uploading && <Loader2 size={12} className="animate-spin" />}
                    {uploading ? '上传中...' : '上传'}
                  </button>
                </>
              ) : (
                <>
                  <label htmlFor="manual-file-upload"
                    className={`inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all cursor-pointer text-sm ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {uploading ? '上传中...' : `上传到 ${activeCategory}`}
                  </label>
                  <span className="text-xs text-[var(--ink-muted-48)]">拖拽 .pdf / .docx / .xlsx / .md / .txt 文件到此处</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Content list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-[var(--primary)]" />
          </div>
        ) : filteredManuals.length === 0 ? (
          <div className="text-center py-20 text-[var(--ink-muted-80)]">
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-[15px] mb-2">
              {searchQuery || activeCategory !== '全部' || activeType ? '没有匹配的内容' : '还没有操作手册'}
            </p>
            {isAdmin && !searchQuery && activeCategory === '全部' && !activeType && (
              <p className="text-xs text-[var(--ink-muted-48)]">点击上方「新建文章」创建第一篇</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredManuals.map(manual => (
              <div key={manual.id}>
                <div
                  onClick={() => (manual.type === 'article' || manual.type === 'document' || manual.type === 'link') && openManual(manual)}
                  className={`flex items-center justify-between p-4 rounded-[var(--radius-md)] border transition-all cursor-pointer bg-[var(--canvas)] hover:border-[var(--primary)]/40 hover:shadow-sm ${
                    manual.type === 'link' ? 'hover:bg-[var(--canvas-parchment)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      manual.type === 'article' ? 'bg-blue-50 text-blue-600' :
                      manual.type === 'document' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-purple-50 text-purple-600'
                    }`}>
                      {manual.type === 'article' ? <BookOpen size={16} /> :
                       manual.type === 'document' ? <FileText size={16} /> :
                       <ExternalLink size={16} />}
                    </div>

                    {/* Title + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium text-[var(--ink)] truncate">{manual.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] border ${getCategoryColor(manual.category)}`}>
                          {manual.category}
                        </span>
                        {manual.type === 'document' && manual.fileName && (
                          <span className="text-[11px] text-[var(--ink-muted-48)]">
                            {manual.fileName} · {formatFileSize(manual.fileSize)}
                          </span>
                        )}
                        {manual.tags && manual.tags.length > 0 && (
                          <div className="flex gap-1">
                            {manual.tags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[11px] text-[var(--ink-muted-48)]">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[11px] text-[var(--ink-muted-48)] hidden sm:inline">
                      {new Date(manual.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <ChevronRight size={16} className="text-[var(--ink-muted-48)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ==================== Main Render ====================

  return (
    <div className="flex min-h-screen bg-[var(--canvas-parchment)]">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="lg:hidden fixed top-[56px] left-3 z-40 p-2 rounded-lg bg-[var(--canvas)] border border-[var(--hairline)] shadow-sm"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
      >
        <Menu size={16} />
      </button>

      {/* Left Sidebar */}
      <aside
        className={`fixed lg:relative lg:shrink-0 top-[48px] lg:top-0 left-0 bottom-0 z-40 lg:z-auto overflow-y-auto bg-[var(--canvas)] border-r border-[var(--hairline)] transition-transform duration-200 lg:translate-x-0 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="p-4">
          {/* Search */}
          <div className="relative mb-4">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
            <input
              type="text"
              placeholder="搜索手册..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (viewMode !== 'list') backToList(); }}
              className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-[var(--canvas-parchment)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40"
            />
          </div>

          {/* Category list */}
          <nav className="space-y-0.5">
            {/* "全部" */}
            <button
              type="button"
              onClick={() => navigateToCategory('全部')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-left transition-colors ${
                activeCategory === '全部' && viewMode === 'list'
                  ? 'bg-[var(--primary)]/8 text-[var(--primary)] font-medium'
                  : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] hover:text-[var(--ink)]'
              }`}
            >
              <span>📄 全部</span>
              <span className="text-xs opacity-60">{totalCount}</span>
            </button>

            {/* Dynamic categories */}
            {categories.map(cat => {
              const isActive = activeCategory === cat.name && viewMode === 'list';
              return (
                <div key={cat.id} className="group relative">
                  {editingCatId === cat.id ? (
                    <div className="flex items-center gap-1 px-2 py-1">
                      <input
                        type="text" value={editCatName}
                        onChange={e => setEditCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateCategory(cat.id); if (e.key === 'Escape') setEditingCatId(null); }}
                        className="flex-1 px-2 py-1 text-xs border border-[var(--hairline)] rounded-[var(--radius-sm)] bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--primary)]/40"
                        autoFocus
                      />
                      <button type="button" onClick={() => handleUpdateCategory(cat.id)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-[var(--radius-sm)]">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button type="button" onClick={() => setEditingCatId(null)}
                        className="p-1 text-[var(--ink-muted-60)] hover:bg-white rounded-[var(--radius-sm)]"><X size={12} /></button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateToCategory(cat.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-left transition-colors ${
                        isActive
                          ? 'bg-[var(--primary)]/8 text-[var(--primary)] font-medium'
                          : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className="text-xs opacity-60 ml-1">{categoryCounts[cat.name] || 0}</span>
                    </button>
                  )}
                  {/* ADMIN actions on hover */}
                  {isAdmin && editingCatId !== cat.id && (
                    <div className="hidden group-hover:flex absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 bg-[var(--canvas)] px-0.5 rounded shadow-sm">
                      <button type="button" onClick={e => { e.stopPropagation(); toggleEditCategory(cat); }}
                        className="p-1 text-[var(--ink-muted-60)] hover:text-[var(--primary)] transition-colors" title="编辑"><Edit2 size={12} /></button>
                      <button type="button" onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id); }}
                        className="p-1 text-[var(--ink-muted-60)] hover:text-[var(--destructive)] transition-colors" title="删除"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add category */}
            {isAdmin && (
              showAddCat ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input type="text" value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddCategory(); if (e.key === 'Escape') { setShowAddCat(false); setNewCatName(''); } }}
                    placeholder="新分类名称"
                    className="flex-1 px-2 py-1 text-xs border border-[var(--hairline)] rounded-[var(--radius-sm)] bg-white text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40"
                    autoFocus
                  />
                  <button type="button" onClick={handleAddCategory}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-[var(--radius-sm)]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button type="button" onClick={() => { setShowAddCat(false); setNewCatName(''); }}
                    className="p-1 text-[var(--ink-muted-60)] hover:bg-white rounded-[var(--radius-sm)]"><X size={12} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowAddCat(true)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs text-[var(--ink-muted-60)] hover:bg-[var(--canvas-parchment)] hover:text-[var(--primary)] transition-colors">
                  <Plus size={12} /> 添加分类
                </button>
              )
            )}
          </nav>

          {/* Admin actions (list view) */}
          {isAdmin && viewMode === 'list' && (
            <div className="mt-4 pt-4 border-t border-[var(--hairline)] space-y-1.5">
              <button type="button" onClick={openCreateArticle}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-[var(--primary)] hover:bg-[var(--primary)]/6 transition-colors">
                <Plus size={14} /> 新建文章
              </button>
              <button type="button" onClick={openCreateLink}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] text-[13px] text-[var(--ink-muted-80)] hover:bg-[var(--canvas-parchment)] hover:text-[var(--ink)] transition-colors">
                <Link2 size={14} /> 添加外链
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main
        className="flex-1 min-w-0 grid grid-cols-1 xl:grid-cols-[1fr_220px]"
      >
        <div className="flex">
          {/* Content area */}
          {viewMode === 'article' ? renderArticleView() : renderListView()}
        </div>

        {/* Right Sidebar — TOC (only for article view with markdown content) */}
        {viewMode === 'article' && (
          <aside
            className="hidden xl:block shrink-0 border-l border-[var(--hairline)] bg-[var(--canvas)]"
            style={{ width: TOC_WIDTH }}
          >
              <div className="sticky top-[48px] p-4 max-h-[calc(100vh-48px)] overflow-y-auto">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-muted-80)] mb-3">
                  <Hash size={12} />
                  <span>本页目录</span>
                </div>
                {tocItems.length > 0 ? (
                  <nav className="space-y-0.5">
                    {tocItems.map((item, idx) => (
                      <a
                        key={idx}
                        href={`#${item.title}`}
                        className={`block text-[12px] transition-colors py-0.5 border-l-2 border-transparent pl-3 hover:text-[var(--ink)] ${
                          item.level === 2
                            ? 'ml-3 text-[var(--ink-muted-48)]'
                            : 'text-[var(--ink-muted-80)]'
                        }`}
                      >
                        {item.title}
                      </a>
                    ))}
                  </nav>
                ) : (
                  <p className="text-[12px] text-[var(--ink-muted-48)]">暂无目录信息</p>
                )}
              </div>
            </aside>
        )}
      </main>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 p-2.5 rounded-full bg-[var(--primary)] text-white shadow-lg hover:bg-[var(--primary-focus)] transition-colors"
        >
          <ArrowUp size={16} />
        </button>
      )}

      {/* ==================== Create/Edit Modal ==================== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[var(--radius-xl)] shadow-xl w-full max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--hairline)]">
              <h3 className="text-lg font-semibold text-[var(--ink)]">
                {editingId ? '编辑' : '新建'}{form.type === 'article' ? '文章' : '外链'}
              </h3>
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--ink-muted-60)] hover:text-[var(--ink)] hover:bg-[var(--canvas-parchment)] transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1.5">标题 <span className="text-[var(--destructive)]">*</span></label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={form.type === 'link' ? '例如：WMOS 官方 Wiki' : '例如：ASN 收货操作流程'}
                  className="w-full px-3 py-2 text-sm bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors" />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1.5">分类</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors">
                  <option value="" disabled>请选择分类</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ink)] mb-1.5">标签（逗号分隔）</label>
                <input type="text" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="例如：入库, 收货, ASN"
                  className="w-full px-3 py-2 text-sm bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors" />
              </div>

              {form.type === 'article' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-[var(--ink)]">内容（支持 Markdown）</label>
                    <button type="button" onClick={() => setPreview(p => !p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-[var(--radius-sm)] text-[var(--ink-muted-80)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/8 transition-colors">
                      {preview ? <><Pencil size={13} /> 编辑</> : <><Eye size={13} /> 预览</>}
                    </button>
                  </div>
                  {preview ? (
                    <div className="min-h-[200px] max-h-[500px] overflow-auto px-4 py-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)]">
                      {form.content ? <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={mdComponents}>{form.content}</ReactMarkdown>
                        : <p className="text-[var(--ink-muted-48)] italic">暂无内容</p>}
                    </div>
                  ) : (
                    <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      placeholder="使用 Markdown 编写内容..." rows={12}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors resize-y" />
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-[var(--ink)] mb-1.5">外部链接 URL <span className="text-[var(--destructive)]">*</span></label>
                  <input type="url" value={form.externalUrl} onChange={e => setForm(f => ({ ...f, externalUrl: e.target.value }))}
                    placeholder="https://wiki.example.com/..."
                    className="w-full px-3 py-2 text-sm bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-[var(--ink)] placeholder:text-[var(--ink-muted-48)] focus:outline-none focus:border-[var(--primary)]/40 transition-colors" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--hairline)]">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 text-sm text-[var(--ink-muted-80)] hover:text-[var(--ink)] transition-colors">取消</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] text-sm font-medium hover:bg-[var(--primary-focus)] transition-colors active:scale-95 disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? '保存中...' : editingId ? '更新' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        isOpen={confirmDelete != null} onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete} title="确认删除"
        description="删除后将无法恢复，确定要删除此操作手册吗？"
        confirmText="确认删除" variant="danger"
      />
    </div>
  );
}
