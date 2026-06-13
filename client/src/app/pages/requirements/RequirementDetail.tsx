import { useParams, Link } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft, Calendar, User, Tag, FileText, MessageSquare, Link2,
  Paperclip, History, Edit, Plus, Trash2, Send, Search, Loader2, CheckCircle2,
  Upload, ChevronDown, ChevronRight, Sparkles, AlertTriangle, CheckCircle,
  Lightbulb, Brain, FlaskConical, Lock
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Breadcrumb } from '../../components/Breadcrumb';
import { getRequirement, getRequirementHistory, type RequirementDetail as ReqDetail, type ActivityLogEntry } from '../../../api/requirements';
import {
  listSubTasks, createSubTask, updateSubTask, deleteSubTask, type SubTask,
  listComments, createComment, deleteComment, type Comment,
  listRelations, createRelation, deleteRelation, searchRequirements,
  REL_TYPE_LABELS, type RelationsResponse, type RequirementRef,
  listAttachments, uploadAttachment, getAttachmentDownloadUrl, deleteAttachment, type Attachment,
  listDocuments, createDocument, deleteDocument, uploadDocument, getDocumentPreview, reindexDocument,
  DOC_TYPE_LABELS, type Document as DocType, type DocumentPreview,
  listTestCases, createTestCase, updateTestCase, deleteTestCase, deleteAllTestCases, PRIORITY_LABELS,
  type TestCase, type TestCaseStep,
  listTestRuns, createTestRun, deleteTestRun, type TestRun,
  listRegressionSuites, createRegressionSuite, deleteRegressionSuite, createRegressionRun, getRegressionRun, updateRegressionRunItem, uploadRegressionScreenshots,
  type RegressionSuite, type RegressionRun, type RegressionRunItem,
} from '../../../api/collaboration';
import { getRequirementInsights, analyzeRequirement } from '../../../api/agent';
import { StatusChangeDialog } from '../../components/StatusChangeDialog';

type TabType = 'details' | 'subtasks' | 'comments' | 'relations' | 'ai-analysis' | 'documents' | 'attachments' | 'test-cases' | 'logs';

import { listRequirementTypes } from '../../../api/req-types';
import type { RequirementTypeItem } from 'shared-types';

const priorityColors: Record<string, string> = {
  P0: '#ff3b30', P1: '#ff9500', P2: '#0066cc', P3: '#34c759',
};

const statusColors: Record<string, string> = {
  // 仅作为兜底,优先使用后端注入的 req.statusColor(来自 WorkflowStatus.color)
  '待评审': '#6c757d', '评审中': '#17a2b8', '设计中': '#ffc107',
  '开发中': '#0066cc', '测试中': '#fd7e14', '已完成': '#28a745',
};

function pickStatusColor(reqStatusColor: string | null | undefined, statusName: string | undefined): string {
  if (reqStatusColor) return reqStatusColor;
  return statusColors[statusName ?? ''] ?? '#6c757d';
}

const SUBTASK_STATUS_OPTIONS = ['待开发', '进行中', '已完成'];

export function RequirementDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [req, setReq] = useState<ReqDetail | null>(null);
  const [history, setHistory] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reqTypes, setReqTypes] = useState<RequirementTypeItem[]>([]);
  useEffect(() => {
    listRequirementTypes().then(setReqTypes).catch(() => setReqTypes([]));
  }, []);
  const reqTypeLabel = (code: string) =>
    reqTypes.find(t => t.code === code)?.displayName ?? code;

  // SubTasks
  const [subtasks, setSubtasks] = useState<SubTask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');

  // Relations
  const [relations, setRelations] = useState<RelationsResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RequirementRef[]>([]);
  const [selectedRelType, setSelectedRelType] = useState('RELATED');
  const searchTimeoutRef = useRef<number | null>(null);

  // Attachments
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Documents
  const [documents, setDocuments] = useState<DocType[]>([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({ docName: '', docType: 'BRD', docPath: '' });
  const DOC_TYPES = ['BRD', 'FSD', 'PRD', '数据模型设计', '其他'];
  const docInputRef = useRef<HTMLInputElement>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const [selectedDocCategory, setSelectedDocCategory] = useState<string>('全部');
  // Inline expand preview state
  const [expandedDocId, setExpandedDocId] = useState<number | null>(null);
  const [expandedContent, setExpandedContent] = useState<DocumentPreview | null>(null);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const previewRequestRef = useRef(0);
  const manuallyCollapsedDocIdRef = useRef<number | null>(null);

  // Status change dialog
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  // AI Insights
  interface AiInsightData {
    similarRequirements?: Array<{ reqId: number; reqNo: string; title: string; priority: string; similarity: number; status: string }>;
    potentialDuplicates?: Array<{ reqId: number; reqNo: string; title: string; similarity: number; reason: string }>;
    feasibility?: { feasible: boolean; confidence: number; tablesInvolved: string[]; modulesInvolved: string[]; estimatedEffortDays: string; risks: string[]; summary: string } | null;
    solution?: { overview: string; approach: string; keyPoints: string[]; references: unknown[] } | null;
  }
  const [aiInsights, setAiInsights] = useState<AiInsightData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Test Cases
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [tcLoading, setTcLoading] = useState(false);
  const [tcGenerating, setTcGenerating] = useState(false);
  const [showTcForm, setShowTcForm] = useState(false);
  const [tcForm, setTcForm] = useState({ title: '', precondition: '', priority: 'P2' });
  const [tcStepsText, setTcStepsText] = useState(''); // Simple textarea for steps input
  const [editingTcId, setEditingTcId] = useState<number | null>(null);

  // Test Runs — keyed by testCaseId
  const [testRuns, setTestRuns] = useState<Record<number, TestRun[]>>({});
  const [expandedTcId, setExpandedTcIdState] = useState<number | null>(null);
  const [showRunForm, setShowRunForm] = useState<number | null>(null);
  const [runForm, setRunForm] = useState({ status: 'passed', result: '' });
  const [runFiles, setRunFiles] = useState<File[]>([]);
  const [runSubmitting, setRunSubmitting] = useState(false);

  // Regression
  const [regSuites, setRegSuites] = useState<RegressionSuite[]>([]);
  const [showSuiteForm, setShowSuiteForm] = useState(false);
  const [suiteForm, setSuiteForm] = useState({ name: '', description: '', testCaseIds: [] as number[] });
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRun, setActiveRun] = useState<RegressionRun | null>(null);
  const [selectedTcIds, setSelectedTcIds] = useState<Set<number>>(new Set());
  const [regForm, setRegForm] = useState<Record<number, { status?: string; result?: string }>>({});
  const [regFiles, setRegFiles] = useState<Record<number, File[]>>({});

  const loadSubtasks = () => {
    if (!id) return;
    listSubTasks(parseInt(id)).then(setSubtasks).catch(() => {});
  };

  const loadComments = () => {
    if (!id) return;
    listComments(parseInt(id)).then(setComments).catch(() => {});
  };

  const loadRelations = () => {
    if (!id) return;
    listRelations(parseInt(id)).then(setRelations).catch(() => {});
  };

  const loadAttachments = () => {
    if (!id) return;
    listAttachments(parseInt(id)).then(setAttachments).catch(() => {});
  };

  const loadDocuments = () => {
    if (!id) return;
    listDocuments(parseInt(id)).then(setDocuments).catch(() => {});
  };

  const loadAiInsights = () => {
    if (!id) return;
    setAiLoading(true);
    getRequirementInsights(parseInt(id))
      .then((insights: any[]) => {
        if (insights?.length > 0) {
          // Get the latest auto_analysis insight
          const latest = insights
            .filter((i: any) => i.insightType === 'auto_analysis')
            .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          if (latest?.structuredData) {
            setAiInsights(latest.structuredData);
          }
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  };

  const handleReAnalyze = async () => {
    if (!id || !req) return;
    setAiLoading(true);
    toast.loading('AI 正在重新分析...', { id: 're-analyze' });
    try {
      await analyzeRequirement(parseInt(id));
      toast.success('AI 重新分析完成', { id: 're-analyze' });
      loadAiInsights(); // Reload insights
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新分析失败', { id: 're-analyze' });
      setAiLoading(false);
    }
  };

  // ================= Test Case Handlers =================

  const loadTestCases = () => {
    if (!id) return;
    setTcLoading(true);
    listTestCases(parseInt(id))
      .then(setTestCases)
      .catch(() => {})
      .finally(() => setTcLoading(false));
  };

  const handleGenerateTestCases = async () => {
    if (!id) return;
    setTcGenerating(true);
    toast.loading('AI 正在生成测试用例...', { id: 'gen-tc' });
    try {
      const res = await fetch(`/api/v1/agent/req/${id}/generate-test-cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || '生成失败');
      toast.success(`AI 已生成 ${body.testCases?.length || 0} 条测试用例`, { id: 'gen-tc' });
      loadTestCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 生成失败', { id: 'gen-tc' });
    } finally {
      setTcGenerating(false);
    }
  };

  const handleCreateManualTc = async () => {
    if (!id || !tcForm.title.trim() || !tcStepsText.trim()) return;
    try {
      const steps: TestCaseStep[] = tcStepsText
        .split('\n')
        .filter(line => line.trim())
        .map((line, i) => {
          const parts = line.split('|').map(s => s.trim());
          return {
            step: i + 1,
            action: parts[0] || '',
            expected: parts[1] || '',
          };
        });
      if (steps.length === 0) { toast.error('请输入测试步骤'); return; }
      await createTestCase(parseInt(id!), { title: tcForm.title, precondition: tcForm.precondition, steps, priority: tcForm.priority });
      setShowTcForm(false);
      setTcForm({ title: '', precondition: '', priority: 'P2' });
      setTcStepsText('');
      toast.success('测试用例已添加');
      loadTestCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleUpdateManualTc = async (tcId: number) => {
    if (!tcForm.title.trim() || !tcStepsText.trim()) return;
    try {
      const steps: TestCaseStep[] = tcStepsText
        .split('\n')
        .filter(line => line.trim())
        .map((line, i) => ({
          step: i + 1,
          action: line.split('|')[0]?.trim() || '',
          expected: line.split('|')[1]?.trim() || '',
        }));
      await updateTestCase(tcId, { title: tcForm.title, precondition: tcForm.precondition, steps, priority: tcForm.priority });
      setEditingTcId(null);
      setShowTcForm(false);
      setTcForm({ title: '', precondition: '', priority: 'P2' });
      setTcStepsText('');
      toast.success('测试用例已更新');
      loadTestCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDeleteManualTc = async (tcId: number) => {
    if (!confirm('确定要删除此测试用例吗？')) return;
    try {
      await deleteTestCase(tcId);
      toast.success('测试用例已删除');
      loadTestCases();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleDeleteAllTestCases = async () => {
    if (!id) return;
    if (!confirm(`确定要删除全部 ${testCases.length} 条测试用例吗？此操作不可撤销。`)) return;
    try {
      const res = await deleteAllTestCases(parseInt(id));
      toast.success(`已删除 ${res.deleted} 条测试用例`);
      loadTestCases();
      loadRegSuites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const openEditTcForm = (tc: TestCase) => {
    setEditingTcId(tc.id);
    setTcForm({ title: tc.title, precondition: tc.precondition || '', priority: tc.priority });
    setTcStepsText((tc.steps || []).map(s => `${s.action} | ${s.expected}`).join('\n'));
    setShowTcForm(true);
  };

  // ================= Test Run Handlers =================

  const loadTestRuns = (tcId: number) => {
    listTestRuns(tcId)
      .then(runs => setTestRuns(prev => ({ ...prev, [tcId]: runs })))
      .catch(() => {});
  };

  const handleSubmitRun = async (tcId: number) => {
    setRunSubmitting(true);
    try {
      await createTestRun(tcId, {
        status: runForm.status,
        result: runForm.result || undefined,
        screenshots: runFiles.length > 0 ? runFiles : undefined,
      });
      toast.success('测试结果已记录');
      setShowRunForm(null);
      setRunForm({ status: 'passed', result: '' });
      setRunFiles([]);
      loadTestRuns(tcId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setRunSubmitting(false);
    }
  };

  const handleDeleteRun = async (runId: number, tcId: number) => {
    if (!confirm('确定要删除这条执行记录吗？')) return;
    try {
      await deleteTestRun(runId);
      toast.success('执行记录已删除');
      loadTestRuns(tcId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const toggleTcExpand = (tcId: number) => {
    if (expandedTcId === tcId) { setExpandedTcIdState(null); }
    else { setExpandedTcIdState(tcId); if (!testRuns[tcId]) loadTestRuns(tcId); }
  };

  // ================= Regression Handlers =================

  const loadRegSuites = () => { if (id) listRegressionSuites(parseInt(id)).then(setRegSuites).catch(() => {}); };

  const handleCreateSuite = async () => {
    if (!id || !suiteForm.name.trim()) return;
    const tcIds = Array.from(selectedTcIds);
    if (tcIds.length === 0) { toast.error("请至少选择一个测试用例"); return; }
    try {
      await createRegressionSuite(parseInt(id), { name: suiteForm.name, description: suiteForm.description, testCaseIds: tcIds });
      toast.success("回归套件已创建");
      setShowSuiteForm(false);
      setSuiteForm({ name: '', description: '', testCaseIds: [] });
      setSelectedTcIds(new Set());
      loadRegSuites();
    } catch (err) { toast.error(err instanceof Error ? err.message : '创建失败'); }
  };

  const toggleSelectTc = (tcId: number) => {
    setSelectedTcIds(prev => { const next = new Set(prev); if (next.has(tcId)) next.delete(tcId); else next.add(tcId); return next; });
  };

  const handleStartRegRun = async (suiteId: number) => {
    try {
      const run = await createRegressionRun(suiteId);
      setActiveRunId(run.id);
      setActiveRun(run);
      setRegForm({});
      setRegFiles({});
      loadRegSuites();
    } catch (err) { toast.error(err instanceof Error ? err.message : '启动失败'); }
  };

  const handleRegItemSubmit = async (itemId: number) => {
    const form = regForm[itemId] || {};
    if (!form.status) { toast.error('请选择执行状态'); return; }
    const status = form.status;
    try {
      await updateRegressionRunItem(itemId, { status, result: form.result });
      if (regFiles[itemId]?.length) {
        await uploadRegressionScreenshots(itemId, regFiles[itemId]);
      }
      toast.success('记录已保存');
      setRegForm(p => { const n = {...p}; delete n[itemId]; return n; });
      setRegFiles(p => { const n = {...p}; delete n[itemId]; return n; });
      if (activeRunId) {
        const updated = await getRegressionRun(activeRunId);
        setActiveRun(updated);
        if (updated.status === 'completed') toast.success('回归测试完成！');
      }
    } catch (err) { toast.error(err instanceof Error ? err.message : '保存失败'); }
  };

  const handleRegFileSelect = (itemId: number, files: FileList | null) => {
    if (files) {
      setRegFiles(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), ...Array.from(files)] }));
    }
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const reqId = parseInt(id);
    Promise.all([
      getRequirement(reqId),
      getRequirementHistory(reqId).catch(() => [] as ActivityLogEntry[]),
      listSubTasks(reqId).catch(() => []),
      listComments(reqId).catch(() => []),
      listRelations(reqId).catch(() => ({ outgoing: [], incoming: [] })),
      listAttachments(reqId).catch(() => []),
      listDocuments(reqId).catch(() => []),
    ])
      .then(([requirement, hist, tasks, comms, rels, atts, docs]) => {
        setReq(requirement);
        setHistory(hist);
        setSubtasks(tasks);
        setComments(comms);
        setRelations(rels);
        setAttachments(atts);
        setDocuments(docs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  // SubTask handlers
  const handleCreateSubtask = async () => {
    if (!id || !newSubtaskTitle.trim()) return;
    try {
      const task = await createSubTask(parseInt(id), { title: newSubtaskTitle.trim() });
      setSubtasks((prev) => [...prev, task]);
      setNewSubtaskTitle('');
      toast.success('子任务创建成功');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleUpdateSubtaskStatus = async (subtask: SubTask) => {
    const currentIndex = SUBTASK_STATUS_OPTIONS.indexOf(subtask.status);
    const nextStatus = SUBTASK_STATUS_OPTIONS[(currentIndex + 1) % SUBTASK_STATUS_OPTIONS.length];
    try {
      const updated = await updateSubTask(subtask.id, { status: nextStatus });
      setSubtasks((prev) => prev.map((t) => (t.id === subtask.id ? updated : t)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    if (!window.confirm('确定要删除该子任务吗？')) return;
    try {
      await deleteSubTask(subtaskId);
      setSubtasks((prev) => prev.filter((t) => t.id !== subtaskId));
      toast.success('子任务已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Comment handlers
  const handlePostComment = async () => {
    if (!id || !commentText.trim()) return;
    try {
      const comment = await createComment(parseInt(id), commentText);
      setComments((prev) => [...prev, comment]);
      setCommentText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '发布失败');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!window.confirm('确定要删除该评论吗？')) return;
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success('评论已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Relation handlers
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) { setSearchResults([]); return; }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchRequirements(value, 10)
        .then((results) => setSearchResults(results.filter((r) => r.id !== parseInt(id || '0'))))
        .catch(() => {});
    }, 300);
  };

  const handleAddRelation = async (target: RequirementRef) => {
    if (!id) return;
    try {
      await createRelation(parseInt(id), { toReqId: target.id, relType: selectedRelType });
      setRelations(null); // Reload
      loadRelations();
      setSearchQuery('');
      setSearchResults([]);
      toast.success('关联关系已创建');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteRelation = async (relationId: number) => {
    if (!window.confirm('确定要删除该关联吗？')) return;
    try {
      await deleteRelation(relationId);
      setRelations(null);
      loadRelations();
      toast.success('关联已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Attachment handlers
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    try {
      const attachment = await uploadAttachment(parseInt(id), file);
      setAttachments((prev) => [attachment, ...prev]);
      toast.success(`${file.name} 上传成功`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attId: number, fileName: string) => {
    if (!window.confirm(`确定要删除附件 "${fileName}" 吗？`)) return;
    try {
      await deleteAttachment(attId);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
      toast.success('附件已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Document handlers
  const handleCreateDocument = async () => {
    if (!id || !docForm.docName.trim()) { toast.error('文档名称不能为空'); return; }
    try {
      const doc = await createDocument(parseInt(id), {
        docName: docForm.docName.trim(),
        docType: docForm.docType,
        docPath: docForm.docPath || undefined,
      });
      setDocuments((prev) => [doc, ...prev]);
      setShowDocModal(false);
      setDocForm({ docName: '', docType: 'BRD', docPath: '' });
      toast.success('文档记录已添加');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    if (!window.confirm('确定要删除该文档记录吗？')) return;
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      toast.success('文档记录已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  // Document upload handlers
  const ALLOWED_DOC_EXTS = ['.md', '.html', '.htm', '.docx', '.xlsx', '.xls'];
  const MAX_DOC_SIZE = 10 * 1024 * 1024;

  const handleDocUpload = async (file: File, type: string) => {
    if (!id) return;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_DOC_EXTS.includes(ext)) {
      toast.error('仅支持 .md / .html / .docx / .xlsx / .xls 格式文件');
      return;
    }
    if (file.size > MAX_DOC_SIZE) {
      toast.error('文件大小不能超过 10MB');
      return;
    }
    setDocUploading(true);
    try {
      const doc = await uploadDocument(parseInt(id), file, type);
      setDocuments((prev) => [doc, ...prev]);
      toast.success(`${file.name} 上传成功`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Use selected category as upload type
      const type = selectedDocCategory === '全部' ? 'BRD' : selectedDocCategory;
      handleDocUpload(file, type);
    }
  };

  const handleReindexDoc = async (doc: DocType) => {
    if (!id || !isLocalFile(doc)) return;
    try {
      const res = await reindexDocument(doc.id);
      setDocuments((prev) => prev.map((d) => d.id === doc.id ? { ...d, ragIndexed: true } : d));
      toast.success(`已索引到 RAG 知识库（${res.chunks} 个分块）`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '索引失败');
    }
  };

  const handleDocDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDocDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const type = selectedDocCategory === '全部' ? 'BRD' : selectedDocCategory;
      handleDocUpload(file, type);
    }
  }, [id, selectedDocCategory]);

  const isLocalFile = useCallback((doc: DocType) => {
    return Boolean(doc.docPath && !doc.docPath.startsWith('http://') && !doc.docPath.startsWith('https://'));
  }, []);

  const openDocumentPreview = useCallback(async (doc: DocType) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    manuallyCollapsedDocIdRef.current = null;
    setExpandedDocId(doc.id);
    setExpandedLoading(true);
    setExpandedContent(null);
    try {
      const preview = await getDocumentPreview(doc.id);
      if (previewRequestRef.current !== requestId) return;
      setExpandedContent(preview);
    } catch (err) {
      if (previewRequestRef.current !== requestId) return;
      toast.error(err instanceof Error ? err.message : '加载失败');
    } finally {
      if (previewRequestRef.current !== requestId) return;
      setExpandedLoading(false);
    }
  }, []);

  // Toggle inline expand preview for a document
  const handleToggleExpand = async (doc: DocType) => {
    if (expandedDocId === doc.id) {
      previewRequestRef.current += 1;
      manuallyCollapsedDocIdRef.current = doc.id;
      setExpandedDocId(null);
      setExpandedContent(null);
      setExpandedLoading(false);
      return;
    }
    await openDocumentPreview(doc);
  };

  // Filter docs by selected category
  const filteredDocs = selectedDocCategory === '全部'
    ? documents
    : documents.filter(d => d.docType === selectedDocCategory);

  // Count docs per category
  const docCounts: Record<string, number> = { '全部': documents.length };
  DOC_TYPES.forEach(t => { docCounts[t] = documents.filter(d => d.docType === t).length; });

  useEffect(() => {
    if (activeTab !== 'documents' || expandedDocId !== null || expandedLoading) return;
    const firstLocalDoc = filteredDocs.find(isLocalFile);
    if (!firstLocalDoc || manuallyCollapsedDocIdRef.current === firstLocalDoc.id) return;
    void openDocumentPreview(firstLocalDoc);
  }, [activeTab, expandedDocId, expandedLoading, filteredDocs, isLocalFile, openDocumentPreview]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (error || !req) {
    return (
      <div className="p-6 text-center py-32">
        <p className="text-[var(--destructive)] mb-4">{error || '需求不存在'}</p>
        <Link to="/app/requirements" className="text-[var(--primary)] hover:underline">
          返回需求列表
        </Link>
      </div>
    );
  }

  const tags: string[] = Array.isArray(req.tags) ? req.tags : [];

  const tabs = [
    { id: 'details' as TabType, label: '详情', icon: FileText },
    { id: 'subtasks' as TabType, label: `子任务 (${subtasks.length})`, icon: FileText },
    { id: 'comments' as TabType, label: `评论 (${comments.length})`, icon: MessageSquare },
    { id: 'relations' as TabType, label: '关联', icon: Link2 },
    { id: 'ai-analysis' as TabType, label: 'AI 分析', icon: Brain },
    { id: 'documents' as TabType, label: `文档 (${documents.length})`, icon: FileText },
    { id: 'attachments' as TabType, label: `附件 (${attachments.length})`, icon: Paperclip },
    { id: 'test-cases' as TabType, label: `测试用例 (${testCases.length})`, icon: FlaskConical },
    { id: 'logs' as TabType, label: '日志', icon: History },
  ];

  return (
    <div className="px-4 sm:px-5 py-3">
      <div className="max-w-[1600px] mx-auto">
        <Breadcrumb />
        {/* Header */}
        <div className="mb-3">
          <Link
            to="/app/requirements"
            className="inline-flex items-center gap-1.5 text-[var(--primary)] hover:underline mb-2 text-sm"
          >
            <ArrowLeft size={15} /> 返回需求列表
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-[var(--ink)] font-mono">{req.reqNo}</h2>
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: priorityColors[req.priority] || '#6c757d' }}>
                  {req.priority}
                </span>
                <button
                  onClick={() => setShowStatusDialog(true)}
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white cursor-pointer hover:opacity-80 transition-opacity hover:ring-2 hover:ring-offset-1 hover:ring-[var(--primary)]"
                  style={{ backgroundColor: pickStatusColor(req.statusColor, req.status) }}
                  title="点击变更状态"
                >
                  {req.status}
                </button>
                <span className="text-sm text-[var(--ink-muted-80)]" title={req.categoryPath}>
                  {req.categoryPath || reqTypeLabel(req.reqType)}
                </span>
              </div>
              <h3 className="text-[var(--ink-muted-80)] mb-4">{req.title}</h3>
              <div className="flex flex-wrap gap-4 text-sm text-[var(--ink-muted-80)]">
                <div className="flex items-center gap-2">
                  <User size={16} /> <span>负责人: {req.assignee || '未分配'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={16} /> <span>期望日期: {req.targetDate?.slice(0, 10) || '未指定'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Tag size={16} /> <span>模块: {req.module || '未指定'}</span>
                </div>
              </div>
            </div>
            <Link
              to={`/app/requirements/${req.id}/edit`}
              className="compact-action flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
            >
              <Edit size={18} /> <span>编辑</span>
            </Link>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mb-6 flex gap-2 flex-wrap">
            {tags.map((tag, i) => (
              <span key={i} className="px-3 py-1 bg-[var(--canvas-parchment)] text-[var(--ink)] rounded-[var(--radius-md)] text-sm">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] border border-[var(--hairline)] overflow-hidden">
          <div className="border-b border-[var(--hairline)] overflow-x-auto">
            <div className="flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'subtasks') loadSubtasks();
                    if (tab.id === 'comments') loadComments();
                    if (tab.id === 'relations') loadRelations();
                    if (tab.id === 'ai-analysis') loadAiInsights();
                    if (tab.id === 'attachments') loadAttachments();
                    if (tab.id === 'test-cases') { loadTestCases(); loadRegSuites(); }
                    if (tab.id === 'documents') loadDocuments();
                  }}
                  className={`flex items-center gap-2 px-5 py-3 whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--canvas-parchment)]'
                      : 'text-[var(--ink-muted-80)] hover:text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'
                  }`}
                >
                  <tab.icon size={18} /> <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 sm:p-4">
            {/* Details Tab */}
            {activeTab === 'details' && (
              <div className="space-y-4">
                {req.background && (
                  <div>
                    <h4 className="mb-2 text-[var(--ink)]">背景</h4>
                    <p className="text-[var(--ink-muted-80)] leading-relaxed whitespace-pre-wrap">{req.background}</p>
                  </div>
                )}
                <div>
                  <h4 className="mb-2 text-[var(--ink)]">需求描述</h4>
                  <p className="text-[var(--ink-muted-80)] leading-relaxed whitespace-pre-wrap">{req.description || '无'}</p>
                </div>
                {req.designSolution && (
                  <div>
                    <h4 className="mb-2 text-[var(--ink)]">设计方案</h4>
                    <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] p-5 bg-[var(--canvas-parchment)]">
                      <div className="text-[var(--ink)] leading-relaxed design-solution-md">
                        <ReactMarkdown
                          skipHtml
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h1 className="text-2xl font-bold text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4 mt-0">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-xl font-semibold text-[var(--ink)] border-b border-[var(--hairline)] pb-1 mb-3 mt-6">{children}</h2>,
                            h3: ({ children }) => <h3 className="text-lg font-semibold text-[var(--ink)] mt-4 mb-2">{children}</h3>,
                            p: ({ children }) => <p className="text-[var(--ink-muted-80)] leading-relaxed mb-3">{children}</p>,
                            code: ({ className, children }) => {
                              const isInline = !className;
                              return isInline
                                ? <code className="px-1 py-0.5 bg-[var(--canvas)] text-[var(--primary)] rounded text-sm font-mono">{children}</code>
                                : <code className="block p-4 bg-[var(--canvas)] rounded-[var(--radius-md)] text-sm font-mono overflow-x-auto leading-relaxed">{children}</code>;
                            },
                            pre: ({ children }) => <pre className="p-4 bg-[var(--canvas)] rounded-[var(--radius-md)] overflow-x-auto my-3">{children}</pre>,
                            table: ({ children }) => (
                              <div className="overflow-x-auto my-4">
                                <table className="min-w-full border-collapse border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden text-sm">
                                  {children}
                                </table>
                              </div>
                            ),
                            thead: ({ children }) => <thead className="bg-[var(--canvas)]">{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr: ({ children }) => <tr className="border-b border-[var(--hairline)] last:border-b-0">{children}</tr>,
                            th: ({ children }) => <th className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm font-semibold text-[var(--ink)] text-left bg-[var(--canvas)] whitespace-nowrap">{children}</th>,
                            td: ({ children }) => <td className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm text-[var(--ink-muted-80)]">{children}</td>,
                            ul: ({ children }) => <ul className="list-disc list-inside text-[var(--ink-muted-80)] space-y-1 mb-3">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal list-inside text-[var(--ink-muted-80)] space-y-1 mb-3">{children}</ol>,
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--primary)] pl-4 text-[var(--ink-muted-80)] italic mb-3">{children}</blockquote>,
                            a: ({ href, children }) => <a href={href} className="text-[var(--primary)] hover:underline">{children}</a>,
                            hr: () => <hr className="border-[var(--hairline)] my-4" />,
                            li: ({ children }) => <li className="text-[var(--ink-muted-80)] mb-1">{children}</li>,
                          }}
                        >
                          {req.designSolution}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--hairline)]">
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">分类</div>
                    <div className="text-[var(--ink)]">
                      {req.categoryPath || reqTypeLabel(req.reqType)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">根类型</div>
                    <div className="text-[var(--ink)]">
                      {reqTypeLabel(req.reqType)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">上报人</div>
                    <div className="text-[var(--ink)]">{req.reporter || '-'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">创建时间</div>
                    <div className="text-[var(--ink)]">{req.createdAt?.slice(0, 10)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">所属组</div>
                    <div className="text-[var(--ink)]">{req.groupName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-[var(--ink-muted-80)] mb-1">更新时间</div>
                    <div className="text-[var(--ink)]">{req.updatedAt?.slice(0, 10)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* SubTasks Tab */}
            {activeTab === 'subtasks' && (
              <div className="space-y-4">
                {/* Add Subtask */}
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateSubtask()}
                    placeholder="输入子任务标题，回车创建..."
                    className="flex-1 px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <button
                    onClick={handleCreateSubtask}
                    className="p-3 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {/* Subtask List */}
                {subtasks.length === 0 ? (
                  <div className="text-center py-8 text-[var(--ink-muted-80)]">暂无子任务</div>
                ) : (
                  <div className="space-y-2">
                    {subtasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-4 p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
                      >
                        <button
                          onClick={() => handleUpdateSubtaskStatus(task)}
                          className="flex-shrink-0"
                          title={`状态: ${task.status}，点击切换`}
                        >
                          {task.status === '已完成' ? (
                            <CheckCircle2 size={20} className="text-[#28a745]" />
                          ) : (
                            <div className={`w-5 h-5 rounded-full border-2 ${
                              task.status === '进行中' ? 'border-[var(--primary)] border-dashed' : 'border-[var(--hairline)]'
                            }`} />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-[var(--ink-muted-80)]">{task.taskNo}</span>
                            <span className={`text-sm ${task.status === '已完成' ? 'line-through text-[var(--ink-muted-80)]' : 'text-[var(--ink)]'}`}>
                              {task.title}
                            </span>
                          </div>
                          {task.assignee && (
                            <span className="text-xs text-[var(--ink-muted-80)]">负责人: {task.assignee}</span>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          task.status === '已完成' ? 'bg-[#d4edda] text-[#155724]' :
                          task.status === '进行中' ? 'bg-[#cce5ff] text-[#004085]' :
                          'bg-[#e2e3e5] text-[#383d41]'
                        }`}>
                          {task.status}
                        </span>
                        <button
                          onClick={() => handleDeleteSubtask(task.id)}
                          className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comments Tab */}
            {activeTab === 'comments' && (
              <div className="space-y-4">
                {/* Comment List */}
                {comments.length > 0 && (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[var(--primary)] rounded-full flex items-center justify-center text-white text-sm font-semibold">
                              {comment.author.charAt(0)}
                            </div>
                            <div>
                              <span className="font-semibold text-[var(--ink)]">{comment.author}</span>
                              <span className="text-sm text-[var(--ink-muted-80)] ml-2">
                                {comment.createdAt?.slice(0, 16).replace('T', ' ')}
                              </span>
                              {comment.isMention && (
                                <span className="ml-2 px-1 py-0.5 bg-[#cce5ff] text-[#004085] rounded text-xs">@提及</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="text-[var(--ink-muted-80)] whitespace-pre-wrap">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Post Comment */}
                <div className="mt-6">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="添加评论，使用 @ 提及他人..."
                    className="w-full p-4 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                    rows={4}
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={!commentText.trim()}
                    className="mt-3 flex items-center gap-2 px-6 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={16} /> 发布评论
                  </button>
                </div>
              </div>
            )}

            {/* Relations Tab */}
            {activeTab === 'relations' && (
              <div className="space-y-4">
                {/* Add Relation */}
                <div className="space-y-3">
                  <h4 className="text-[var(--ink)]">添加关联</h4>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(REL_TYPE_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedRelType(key)}
                        className={`px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors ${
                          selectedRelType === key
                            ? 'bg-[var(--primary)] text-white'
                            : 'bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-muted-48)]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="搜索需求编号或标题..."
                        className="w-full pl-10 pr-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                      />
                    </div>
                  </div>
                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      {searchResults.map((result) => (
                        <div
                          key={result.id}
                          className="flex items-center justify-between p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
                        >
                          <div>
                            <span className="font-mono text-sm text-[var(--primary)]">{result.reqNo}</span>
                            <span className="ml-2 text-sm text-[var(--ink)]">{result.title}</span>
                          </div>
                          <button
                            onClick={() => handleAddRelation(result)}
                            className="px-3 py-1 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                          >
                            关联
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Existing Relations */}
                {relations && (
                  <>
                    {relations.outgoing.length > 0 && (
                      <div>
                        <h4 className="mb-3 text-[var(--ink)]">关联的需求</h4>
                        <div className="space-y-2">
                          {relations.outgoing.map((rel) => (
                            <div key={rel.id} className="flex items-center justify-between p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-xs font-semibold">
                                  {REL_TYPE_LABELS[rel.relType] || rel.relType}
                                </span>
                                <Link to={`/app/requirements/${rel.toReq?.id}`} className="font-mono text-sm text-[var(--primary)] hover:underline">
                                  {rel.toReq?.reqNo}
                                </Link>
                                <span className="text-sm text-[var(--ink)]">{rel.toReq?.title}</span>
                                <span className="px-2 py-0.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-full text-xs text-[var(--ink-muted-80)]">
                                  {rel.toReq?.status}
                                </span>
                              </div>
                              <button
                                onClick={() => handleDeleteRelation(rel.id)}
                                className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {relations.incoming.length > 0 && (
                      <div>
                        <h4 className="mb-3 text-[var(--ink)]">被关联</h4>
                        <div className="space-y-2">
                          {relations.incoming.map((rel) => (
                            <div key={rel.id} className="flex items-center justify-between p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-xs font-semibold">
                                  {REL_TYPE_LABELS[rel.relType] || rel.relType}
                                </span>
                                <Link to={`/app/requirements/${rel.fromReq?.id}`} className="font-mono text-sm text-[var(--primary)] hover:underline">
                                  {rel.fromReq?.reqNo}
                                </Link>
                                <span className="text-sm text-[var(--ink)]">{rel.fromReq?.title}</span>
                              </div>
                              <button
                                onClick={() => handleDeleteRelation(rel.id)}
                                className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {relations.outgoing.length === 0 && relations.incoming.length === 0 && (
                      <div className="text-center py-8 text-[var(--ink-muted-80)]">暂无关联关系</div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* AI Analysis Tab */}
            {activeTab === 'ai-analysis' && (
              <div className="space-y-4">
                {/* Header with re-analyze button */}
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 text-[var(--ink)]">
                    <Brain size={18} className="text-[var(--primary)]" />
                    AI 分析结果
                  </h4>
                  <button
                    onClick={handleReAnalyze}
                    disabled={aiLoading}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-[var(--primary)] text-[var(--primary)] rounded-[var(--radius-pill)] hover:bg-[var(--primary)] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    重新分析
                  </button>
                </div>

                {aiLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 size={32} className="animate-spin text-[var(--primary)]" />
                    <span className="ml-3 text-[var(--ink-muted-80)]">AI 正在分析...</span>
                  </div>
                ) : !aiInsights ? (
                  <div className="text-center py-16 text-[var(--ink-muted-80)]">
                    <Brain size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="mb-2">暂无 AI 分析数据</p>
                    <p className="text-xs text-[var(--ink-muted-48)] mb-4">点击上方"重新分析"按钮触发 AI 分析</p>
                  </div>
                ) : (
                  <>
                    {/* Feasibility Card */}
                    {aiInsights.feasibility && (
                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-[var(--ink)]">
                          <CheckCircle size={18} className="text-emerald-500" />
                          可行性评估
                        </h4>
                        <div className="bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)] p-5">
                          <div className="flex items-center gap-4 mb-4">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                              aiInsights.feasibility.feasible
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {aiInsights.feasibility.feasible ? '可行' : '存在风险'}
                            </span>
                            <span className="text-sm text-[var(--ink-muted-80)]">
                              置信度: {aiInsights.feasibility.confidence}/10
                            </span>
                            <span className="text-sm text-[var(--ink-muted-80)]">
                              预估工时: {aiInsights.feasibility.estimatedEffortDays}
                            </span>
                          </div>
                          <p className="text-[var(--ink-muted-80)] mb-4 whitespace-pre-wrap">{aiInsights.feasibility.summary}</p>
                          {aiInsights.feasibility.risks.length > 0 && (
                            <div>
                              <h5 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-1">
                                <AlertTriangle size={14} /> 风险点
                              </h5>
                              <ul className="space-y-1">
                                {aiInsights.feasibility.risks.map((r, i) => (
                                  <li key={i} className="text-sm text-[var(--ink-muted-80)] flex items-start gap-2">
                                    <span className="text-amber-500 mt-1">•</span> {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {(aiInsights.feasibility.tablesInvolved.length > 0 || aiInsights.feasibility.modulesInvolved.length > 0) && (
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--hairline)]">
                              {aiInsights.feasibility.tablesInvolved.map((t, i) => (
                                <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs font-mono">{t}</span>
                              ))}
                              {aiInsights.feasibility.modulesInvolved.map((m, i) => (
                                <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-xs">{m}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Solution Card */}
                    {aiInsights.solution && (
                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-[var(--ink)]">
                          <Lightbulb size={18} className="text-amber-500" />
                          实现方案建议
                        </h4>
                        <div className="bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)] p-5">
                          <div className="text-[var(--ink)] mb-4">
                            <h5 className="font-semibold mb-2">概述</h5>
                            <p className="text-[var(--ink-muted-80)] whitespace-pre-wrap">{aiInsights.solution.overview}</p>
                          </div>
                          {aiInsights.solution.approach && (
                            <div className="text-[var(--ink)] mb-4">
                              <h5 className="font-semibold mb-2">实现思路</h5>
                              <p className="text-[var(--ink-muted-80)] whitespace-pre-wrap">{aiInsights.solution.approach}</p>
                            </div>
                          )}
                          {aiInsights.solution.keyPoints.length > 0 && (
                            <div>
                              <h5 className="font-semibold text-[var(--ink)] mb-2">关键点</h5>
                              <ul className="space-y-1">
                                {aiInsights.solution.keyPoints.map((kp, i) => (
                                  <li key={i} className="text-sm text-[var(--ink-muted-80)] flex items-start gap-2">
                                    <span className="text-[var(--primary)] mt-1">•</span> {kp}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Similar Requirements */}
                    {aiInsights.similarRequirements && aiInsights.similarRequirements.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-[var(--ink)]">
                          <Sparkles size={18} className="text-[var(--primary)]" />
                          相似需求
                        </h4>
                        <div className="space-y-2">
                          {aiInsights.similarRequirements.slice(0, 10).map((sr) => (
                            <div key={sr.reqId} className="flex items-center justify-between p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)]">
                              <div className="flex items-center gap-3 min-w-0">
                                <Link to={`/app/requirements/${sr.reqId}`} className="font-mono text-sm text-[var(--primary)] hover:underline shrink-0">
                                  {sr.reqNo}
                                </Link>
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
                    {aiInsights.potentialDuplicates && aiInsights.potentialDuplicates.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="flex items-center gap-2 text-amber-600">
                          <AlertTriangle size={18} />
                          疑似重复需求
                        </h4>
                        <div className="space-y-2">
                          {aiInsights.potentialDuplicates.map((dup) => (
                            <div key={dup.reqId} className="flex items-center justify-between p-3 bg-amber-50 rounded-[var(--radius-md)] border border-amber-200">
                              <div className="flex items-center gap-3 min-w-0">
                                <Link to={`/app/requirements/${dup.reqId}`} className="font-mono text-sm text-[var(--primary)] hover:underline shrink-0">
                                  {dup.reqNo}
                                </Link>
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
                  </>
                )}
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="space-y-3">
                {history.length === 0 ? (
                  <p className="text-[var(--ink-muted-80)] text-center py-8">暂无操作日志</p>
                ) : (
                  history.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                      <span className="text-xs text-[var(--ink-muted-80)] whitespace-nowrap">
                        {log.createdAt?.slice(0, 16).replace('T', ' ')}
                      </span>
                      <span className="text-sm font-medium text-[var(--ink)]">{log.actor}</span>
                      <span className="text-sm text-[var(--primary)]">{log.action}</span>
                      {log.fieldName && (
                        <span className="text-sm text-[var(--ink-muted-80)]">
                          {log.fieldName}: {log.oldValue || '(空)'} → {log.newValue || '(空)'}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Documents Tab — Dual pane: sidebar + preview */}
            {activeTab === 'documents' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[var(--ink)]">关联文档</h4>
                  <button
                    onClick={() => setShowDocModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-all text-sm"
                  >
                    <Plus size={16} /> 添加链接
                  </button>
                </div>

                <div className="flex gap-4 min-h-[600px]">
                  {/* Left sidebar — directory tree */}
                  <div className="w-44 shrink-0 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] border border-[var(--hairline)] p-2">
                    <button
                      onClick={() => {
                        setSelectedDocCategory('全部');
                        manuallyCollapsedDocIdRef.current = null;
                        setExpandedDocId(null);
                        setExpandedContent(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
                        selectedDocCategory === '全部'
                          ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                          : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]'
                      }`}
                    >
                      <span>📄 全部</span>
                      <span className="text-xs opacity-60">{docCounts['全部']}</span>
                    </button>
                    {DOC_TYPES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedDocCategory(cat);
                          manuallyCollapsedDocIdRef.current = null;
                          setExpandedDocId(null);
                          setExpandedContent(null);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-sm transition-colors ${
                          selectedDocCategory === cat
                            ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                            : 'text-[var(--ink-muted-80)] hover:bg-[var(--canvas)] hover:text-[var(--ink)]'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className="text-xs opacity-60">{docCounts[cat]}</span>
                      </button>
                    ))}
                  </div>

                  {/* Right pane — upload + document list */}
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Upload zone — only visible when a specific category is selected */}
                    {selectedDocCategory !== '全部' && (
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDocDragOver(true); }}
                        onDragLeave={() => setDocDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDocDragOver(false);
                          const file = e.dataTransfer.files[0];
                          if (file) handleDocUpload(file, selectedDocCategory);
                        }}
                        className={`border-2 border-dashed rounded-[var(--radius-md)] p-4 text-center transition-colors ${
                          docDragOver
                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--hairline)]'
                        }`}
                      >
                        <input
                          ref={docInputRef}
                          type="file"
                          accept=".md,.html,.htm,.docx,.xlsx,.xls"
                          onChange={handleDocFileChange}
                          className="hidden"
                          id="doc-file-upload"
                        />
                        <label
                          htmlFor="doc-file-upload"
                          className={`inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all cursor-pointer text-sm ${
                            docUploading ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {docUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                          {docUploading ? '上传中...' : `上传到 ${selectedDocCategory}`}
                        </label>
                        <p className="text-xs text-[var(--ink-muted-48)] mt-2">拖拽 .md / .html / .docx / .xlsx 文件到此处上传</p>
                      </div>
                    )}

                    {/* Document list */}
                    {filteredDocs.length === 0 ? (
                      <div className="text-center py-16 text-[var(--ink-muted-80)]">
                        <FileText size={48} className="mx-auto mb-4 opacity-30" />
                        <p className="mb-2">
                          {selectedDocCategory === '全部' ? '暂无关联文档' : `${selectedDocCategory} 类型下暂无文档`}
                        </p>
                        {selectedDocCategory !== '全部' && (
                          <p className="text-xs text-[var(--ink-muted-48)]">点击上方上传按钮添加文档</p>
                        )}
                      </div>
                    ) : (
                      filteredDocs.map((doc) => (
                        <div key={doc.id}>
                          {/* Document row — clickable to expand */}
                          <div
                            onClick={() => isLocalFile(doc) && handleToggleExpand(doc)}
                            className={`flex items-center justify-between p-3 rounded-[var(--radius-md)] border transition-colors ${
                              isLocalFile(doc)
                                ? 'bg-[var(--canvas-parchment)] border-[var(--hairline)] cursor-pointer hover:border-[var(--primary)]'
                                : 'bg-[var(--canvas-parchment)] border-[var(--hairline)]'
                            } ${expandedDocId === doc.id ? 'rounded-b-none border-b-0' : ''}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isLocalFile(doc) ? (
                                <span className="text-[var(--ink-muted-48)]">
                                  {expandedDocId === doc.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </span>
                              ) : null}
                              <span className="px-2 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded text-xs font-semibold shrink-0">
                                {doc.docType}
                              </span>
                              <span className="text-sm font-medium text-[var(--ink)] truncate">{doc.docName}</span>
                              {!isLocalFile(doc) && doc.docPath && (
                                <a
                                  href={doc.docPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-[var(--primary)] hover:underline shrink-0"
                                >
                                  查看链接
                                </a>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-[var(--ink-muted-80)] shrink-0">
                              {doc.ragIndexed && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-xs border border-emerald-200" title="已索引到 RAG 知识库">
                                  🧠 RAG
                                </span>
                              )}
                              {isLocalFile(doc) && !doc.ragIndexed && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleReindexDoc(doc); }}
                                  className="px-1.5 py-0.5 bg-[var(--canvas)] text-[var(--primary)] rounded text-xs border border-[var(--hairline)] hover:bg-[var(--canvas-parchment)]"
                                  title="索引到 RAG 知识库"
                                >
                                  索引RAG
                                </button>
                              )}
                              <span className="hidden sm:inline">{doc.createdAt?.slice(0, 10)}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.id); }}
                                className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas)] rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded preview content */}
                          {expandedDocId === doc.id && (
                            <div className="bg-white border border-[var(--hairline)] border-t-0 rounded-b-[var(--radius-md)] px-5 py-4">
                              {expandedLoading && (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
                                  <span className="ml-3 text-sm text-[var(--ink-muted-80)]">加载中...</span>
                                </div>
                              )}
                              {!expandedLoading && expandedContent?.isExternal && (
                                <div className="text-center py-8">
                                  <p className="text-[var(--ink-muted-80)] mb-3">这是一个外部链接文档</p>
                                  <a
                                    href={expandedContent.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--primary)] hover:underline"
                                  >
                                    在新窗口打开 →
                                  </a>
                                </div>
                              )}
                              {!expandedLoading && !expandedContent?.isExternal && !expandedContent?.content && (
                                <div className="text-center py-8 text-[var(--ink-muted-80)]">
                                  <p>文档内容为空或文件已被删除</p>
                                </div>
                              )}
                              {!expandedLoading && !expandedContent?.isExternal && expandedContent?.content && (
                                <>
                                  {expandedContent.mimeType === 'text/markdown' ? (
                                    <div className="text-[var(--ink)] leading-relaxed">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                          h1: ({ children }) => <h1 className="text-2xl font-bold text-[var(--ink)] border-b border-[var(--hairline)] pb-2 mb-4 mt-0">{children}</h1>,
                                          h2: ({ children }) => <h2 className="text-xl font-semibold text-[var(--ink)] border-b border-[var(--hairline)] pb-1 mb-3 mt-6">{children}</h2>,
                                          h3: ({ children }) => <h3 className="text-lg font-semibold text-[var(--ink)] mt-4 mb-2">{children}</h3>,
                                          p: ({ children }) => <p className="text-[var(--ink-muted-80)] leading-relaxed mb-3">{children}</p>,
                                          code: ({ className, children }) => {
                                            const isInline = !className;
                                            return isInline
                                              ? <code className="px-1 py-0.5 bg-[var(--canvas-parchment)] text-[var(--primary)] rounded text-sm font-mono">{children}</code>
                                              : <code className="block p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] text-sm font-mono overflow-x-auto leading-relaxed">{children}</code>;
                                          },
                                          pre: ({ children }) => <pre className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] overflow-x-auto my-3">{children}</pre>,
                                          table: ({ children }) => (
                                            <div className="overflow-x-auto my-4">
                                              <table className="min-w-full border-collapse border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden text-sm">
                                                {children}
                                              </table>
                                            </div>
                                          ),
                                          thead: ({ children }) => <thead className="bg-[var(--canvas-parchment)]">{children}</thead>,
                                          tbody: ({ children }) => <tbody>{children}</tbody>,
                                          tr: ({ children }) => <tr className="border-b border-[var(--hairline)] last:border-b-0">{children}</tr>,
                                          th: ({ children }) => <th className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm font-semibold text-[var(--ink)] text-left bg-[var(--canvas-parchment)] whitespace-nowrap">{children}</th>,
                                          td: ({ children }) => <td className="px-4 py-2.5 border-r border-[var(--hairline)] last:border-r-0 text-sm text-[var(--ink-muted-80)]">{children}</td>,
                                          ul: ({ children }) => <ul className="list-disc list-inside text-[var(--ink-muted-80)] space-y-1 mb-3">{children}</ul>,
                                          ol: ({ children }) => <ol className="list-decimal list-inside text-[var(--ink-muted-80)] space-y-1 mb-3">{children}</ol>,
                                          blockquote: ({ children }) => <blockquote className="border-l-4 border-[var(--primary)] pl-4 text-[var(--ink-muted-80)] italic mb-3">{children}</blockquote>,
                                          a: ({ href, children }) => <a href={href} className="text-[var(--primary)] hover:underline">{children}</a>,
                                          hr: () => <hr className="border-[var(--hairline)] my-4" />,
                                          li: ({ children }) => <li className="text-[var(--ink-muted-80)] mb-1">{children}</li>,
                                        }}
                                      >
                                        {expandedContent.content}
                                      </ReactMarkdown>
                                    </div>
                                  ) : (
                                    <div>
                                      <p className="text-xs text-[var(--ink-muted-48)] mb-2 flex items-center gap-1">
                                        ⚠️ 提示：HTML 文档中的图片如果使用了相对路径，需要图片文件已上传到服务器。建议将图片转为 Base64 嵌入或使用绝对 URL。
                                      </p>
                                      <iframe
                                        srcDoc={(() => {
                                          const html = expandedContent.content || '';
                                          // Inject base URL so relative image paths can resolve
                                          // against the current page's base URL
                                          const baseTag = `<base href="${window.location.origin}/">`;
                                          // Inject script to intercept anchor links and prevent page navigation
                                          const interceptScript = `<script>
                                            document.addEventListener('click', function(e) {
                                              var link = e.target.closest('a');
                                              if (link && link.hash && link.hash.startsWith('#')) {
                                                e.preventDefault();
                                                var target = document.getElementById(link.hash.slice(1));
                                                if (target) target.scrollIntoView({ behavior: 'smooth' });
                                              }
                                            }, true);
                                          </script>`;
                                          let processed = html;
                                          if (html.includes('<head>')) {
                                            processed = html.replace('<head>', '<head>' + baseTag);
                                          } else if (html.includes('<html')) {
                                            processed = html.replace(/<html[^>]*>/, '$&<head>' + baseTag + '</head>');
                                          } else {
                                            processed = baseTag + html;
                                          }
                                          if (processed.includes('</body>')) {
                                            processed = processed.replace('</body>', interceptScript + '</body>');
                                          } else {
                                            processed = processed + interceptScript;
                                          }
                                          return processed;
                                        })()}
                                        className="w-full border-0 min-h-[500px]"
                                        sandbox="allow-same-origin allow-scripts"
                                        title={expandedContent.fileName}
                                      />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add Document (URL bookmark) Modal */}
                {showDocModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-[var(--canvas)] rounded-[var(--radius-lg)] p-6 w-full max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                      <h3 className="mb-6 text-[var(--ink)]">添加文档链接</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block mb-2 text-sm text-[var(--ink)]">文档名称 *</label>
                          <input
                            type="text"
                            value={docForm.docName}
                            onChange={(e) => setDocForm((f) => ({ ...f, docName: e.target.value }))}
                            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            placeholder="例如：入库功能 BRD"
                          />
                        </div>
                        <div>
                          <label className="block mb-2 text-sm text-[var(--ink)]">文档类型</label>
                          <select
                            value={docForm.docType}
                            onChange={(e) => setDocForm((f) => ({ ...f, docType: e.target.value }))}
                            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                          >
                            {DOC_TYPES.map((t) => (
                              <option key={t} value={t}>{DOC_TYPE_LABELS[t] || t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block mb-2 text-sm text-[var(--ink)]">文档路径/链接</label>
                          <input
                            type="text"
                            value={docForm.docPath}
                            onChange={(e) => setDocForm((f) => ({ ...f, docPath: e.target.value }))}
                            className="w-full px-4 py-3 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                            placeholder="https://... 或本地路径"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowDocModal(false)} className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]">取消</button>
                        <button onClick={handleCreateDocument} className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]">添加</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attachments Tab */}
            {activeTab === 'attachments' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[var(--ink)]">附件列表</h4>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all cursor-pointer text-sm ${
                        uploading ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      {uploading ? '上传中...' : '上传附件'}
                    </label>
                  </div>
                </div>

                {attachments.length === 0 ? (
                  <div className="text-center py-12 text-[var(--ink-muted-80)]">
                    <Paperclip size={48} className="mx-auto mb-4 opacity-30" />
                    <p>暂无附件，点击"上传附件"添加文件</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {attachments.map((att) => {
                      const sizeKB = att.fileSize ? (att.fileSize / 1024).toFixed(1) : '?';
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Paperclip size={16} className="text-[var(--ink-muted-48)] flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--ink)] truncate">{att.fileName}</p>
                              <p className="text-xs text-[var(--ink-muted-80)]">
                                {att.mimeType} · {sizeKB} KB · {att.uploadedBy} · {att.createdAt?.slice(0, 10)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={getAttachmentDownloadUrl(att.id)}
                              download={att.fileName}
                              className="px-3 py-1 text-sm text-[var(--primary)] border border-[var(--primary)] rounded-[var(--radius-md)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                            >
                              下载
                            </a>
                            <button
                              onClick={() => handleDeleteAttachment(att.id, att.fileName)}
                              className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas-parchment)] rounded transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Test Cases Tab */}
            {activeTab === 'test-cases' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-[var(--ink)]">测试用例</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerateTestCases}
                      disabled={tcGenerating}
                      className={`flex items-center gap-2 px-4 py-2 rounded-[var(--radius-pill)] text-sm transition-all ${
                        tcGenerating
                          ? 'bg-[var(--hairline)] text-[var(--ink-muted-48)] cursor-not-allowed'
                          : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-focus)]'
                      }`}
                    >
                      {tcGenerating ? (
                        <><Loader2 size={14} className="animate-spin" /> AI 生成中...</>
                      ) : (
                        <><Sparkles size={14} /> {testCases.length > 0 ? 'AI 补充用例' : 'AI 生成测试用例'}</>
                      )}
                    </button>
                    {!showTcForm && (
                      <button
                        onClick={() => setShowTcForm(true)}
                        className="flex items-center gap-2 px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-pill)] text-sm hover:bg-[var(--canvas-parchment)] transition-colors"
                      >
                        <Plus size={14} /> 手动添加
                      </button>
                    )}
                    {testCases.length > 0 && (
                      <button
                        onClick={handleDeleteAllTestCases}
                        className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-[var(--radius-pill)] text-sm hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} /> 一键删除
                      </button>
                    )}
                  </div>
                </div>

                {/* Manual Add/Edit Form */}
                {showTcForm && (
                  <div className="p-4 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] space-y-3">
                    <h5 className="text-sm font-medium text-[var(--ink)]">
                      {editingTcId ? '编辑测试用例' : '添加测试用例'}
                    </h5>
                    <input
                      type="text"
                      placeholder="测试标题"
                      value={tcForm.title}
                      onChange={e => setTcForm(p => ({ ...p, title: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm bg-white"
                    />
                    <input
                      type="text"
                      placeholder="前置条件（可选）"
                      value={tcForm.precondition}
                      onChange={e => setTcForm(p => ({ ...p, precondition: e.target.value }))}
                      className="w-full px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm bg-white"
                    />
                    <div>
                      <label className="text-xs text-[var(--ink-muted-80)] mb-1 block">
                        测试步骤（每行一个步骤，格式：操作 | 预期结果）
                      </label>
                      <textarea
                        placeholder="点击新建入库单按钮 | 弹出入库单创建页面&#10;填写必填项并提交 | 提示创建成功"
                        value={tcStepsText}
                        onChange={e => setTcStepsText(e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm bg-white resize-y"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <select
                        value={tcForm.priority}
                        onChange={e => setTcForm(p => ({ ...p, priority: e.target.value }))}
                        className="px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm bg-white"
                      >
                        <option value="P0">P0 紧急</option>
                        <option value="P1">P1 高</option>
                        <option value="P2">P2 中</option>
                        <option value="P3">P3 低</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setShowTcForm(false); setEditingTcId(null); }}
                        className="px-4 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm hover:bg-white transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => editingTcId ? handleUpdateManualTc(editingTcId) : handleCreateManualTc()}
                        className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-sm hover:bg-[var(--primary-focus)] transition-colors"
                      >
                        {editingTcId ? '保存修改' : '添加'}
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== Regression Suites ===== */}
                {regSuites.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-[var(--ink)] flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-600" /> 回归套件
                      <button onClick={loadRegSuites} className="text-xs text-[var(--primary)] hover:underline ml-auto">刷新</button>
                    </h5>
                    {regSuites.map(suite => {
                      const passRate = suite.latestRun ? Math.round((suite.latestRun.passCount / suite.latestRun.totalCount) * 100) : null;
                      return (
                        <div key={suite.id} className="p-3 bg-green-50 border border-green-200 rounded-[var(--radius-md)]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--ink)]">{suite.name}</span>
                              <span className="text-xs text-[var(--ink-muted-80)]">{suite.items.length} 条用例</span>
                              {passRate !== null && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${passRate === 100 ? 'bg-green-200 text-green-800' : passRate >= 70 ? 'bg-yellow-200 text-yellow-800' : 'bg-red-200 text-red-800'}`}>
                                  {passRate}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleStartRegRun(suite.id)} className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                                <Sparkles size={10} /> 执行回归
                              </button>
                              <button onClick={() => { if(confirm('删除此套件？')) deleteRegressionSuite(suite.id).then(loadRegSuites); }} className="p-1 text-[var(--destructive)] hover:bg-white rounded">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {suite.items.map(i => (
                              <span key={i.id} className="px-1.5 py-0.5 bg-white rounded text-xs text-[var(--ink-muted-80)] border border-[var(--hairline)]">
                                {i.testCase.caseNo}
                              </span>
                            ))}
                          </div>
                          {suite.latestRun && (
                            <p className="text-xs text-[var(--ink-muted-80)] mt-1">
                              最近执行: {suite.latestRun.createdAt?.slice(0,16).replace('T',' ')} ·
                              ✅{suite.latestRun.passCount} ❌{suite.latestRun.failCount}
                              {suite.latestRun.status === 'running' && ' · 进行中'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Suite create button */}
                {testCases.length > 0 && (
                  <button
                    onClick={() => { if (showSuiteForm) { setShowSuiteForm(false); } else { setShowSuiteForm(true); setSelectedTcIds(new Set()); } }}
                    className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-green-400 rounded-[var(--radius-md)] text-xs text-green-600 hover:bg-green-50 w-full justify-center"
                  >
                    <Plus size={12} /> {showSuiteForm ? '取消创建回归套件' : '创建回归套件'}
                  </button>
                )}

                {/* Suite create form */}
                {showSuiteForm && (
                  <div className="p-3 bg-green-50 rounded-[var(--radius-md)] space-y-2">
                    <input
                      type="text" placeholder="套件名称（如：入库全量回归）"
                      value={suiteForm.name} onChange={e => setSuiteForm(p=>({...p,name:e.target.value}))}
                      className="w-full px-3 py-2 border border-green-200 rounded-[var(--radius-md)] text-sm bg-white"
                    />
                    <input
                      type="text" placeholder="描述（可选）"
                      value={suiteForm.description} onChange={e => setSuiteForm(p=>({...p,description:e.target.value}))}
                      className="w-full px-3 py-2 border border-green-200 rounded-[var(--radius-md)] text-sm bg-white"
                    />
                    <div>
                      <p className="text-xs text-[var(--ink-muted-80)] mb-1">选择用例（已选 {selectedTcIds.size} 条）：</p>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                        {testCases.map(tc => (
                          <button
                            key={tc.id}
                            onClick={() => toggleSelectTc(tc.id)}
                            className={`px-2 py-1 rounded text-xs border transition-colors ${
                              selectedTcIds.has(tc.id)
                                ? 'bg-green-600 text-white border-green-600'
                                : 'bg-white text-[var(--ink)] border-[var(--hairline)] hover:border-green-400'
                            }`}
                          >
                            {tc.caseNo}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowSuiteForm(false)} className="px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs hover:bg-white">取消</button>
                      <button onClick={handleCreateSuite} className="px-3 py-1.5 bg-green-600 text-white rounded-[var(--radius-md)] text-xs hover:bg-green-700">创建套件</button>
                    </div>
                  </div>
                )}

                {/* Active Regression Run */}
                {activeRun && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-[var(--radius-md)] space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-medium text-[var(--ink)]">🔬 回归测试</h5>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        activeRun.status === 'completed' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                      }`}>
                        {activeRun.status === 'completed' ? '已完成' : `${activeRun.totalCount - (activeRun.passCount + activeRun.failCount + activeRun.blockedCount)} 条待执行`}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600">✅ {activeRun.passCount}</span>
                      <span className="text-red-600">❌ {activeRun.failCount}</span>
                      <span className="text-orange-600">🚫 {activeRun.blockedCount}</span>
                      <span className="text-[var(--ink-muted-48)]">共 {activeRun.totalCount} 条</span>
                      {activeRun.status === 'completed' && (
                        <span className="font-medium text-green-700 ml-2">
                          通过率 {Math.round((activeRun.passCount / activeRun.totalCount) * 100)}%
                        </span>
                      )}
                    </div>
                    {activeRun.items.map(item => (
                      <div key={item.id} className="p-3 bg-white rounded-[var(--radius-md)] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--ink)]">
                            {item.testCase.caseNo} {item.testCase.title}
                          </span>
                          <span className="text-xs text-[var(--ink-muted-48)]">{new Date().toLocaleString()}</span>
                        </div>
                        {item.status === 'pending' ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={regForm[item.id]?.status || ''}
                                onChange={e => setRegForm(p => ({ ...p, [item.id]: { ...(p[item.id] || {}), status: e.target.value } }))}
                                className="px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs bg-white"
                              >
                                <option value="" disabled>请选择状态</option>
                                <option value="passed">✅ 通过</option>
                                <option value="failed">❌ 失败</option>
                                <option value="blocked">🚫 阻塞</option>
                              </select>
                              <label className="flex items-center gap-1 px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs cursor-pointer hover:bg-[var(--canvas)]">
                                📎 截图
                                <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleRegFileSelect(item.id, e.target.files)} />
                              </label>
                              {(regFiles[item.id]?.length || 0) > 0 && (
                                <span className="text-xs text-[var(--ink-muted-80)]">{regFiles[item.id]?.length} 个文件</span>
                              )}
                            </div>
                            <textarea
                              placeholder="测试结果备注..."
                              value={regForm[item.id]?.result || ''}
                              onChange={e => setRegForm(p => ({ ...p, [item.id]: { ...(p[item.id] || {}), result: e.target.value } }))}
                              rows={2}
                              className="w-full px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs bg-white resize-y"
                            />
                            <button
                              onClick={() => handleRegItemSubmit(item.id)}
                              className="px-4 py-1.5 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-xs hover:bg-[var(--primary-focus)]"
                            >
                              保存记录
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${
                                item.status === 'passed' ? 'text-green-600' : item.status === 'failed' ? 'text-red-600' : 'text-orange-600'
                              }`}>
                                {item.status === 'passed' ? '✅ 通过' : item.status === 'failed' ? '❌ 失败' : '🚫 阻塞'}
                              </span>
                              <span className="text-xs text-[var(--ink-muted-48)]">
                                {item.createdAt ? item.createdAt.slice(0, 16).replace('T', ' ') : ''}
                              </span>
                            </div>
                            {item.result && <p className="text-xs text-[var(--ink)]">{item.result}</p>}
                            {item.screenshots && (item.screenshots as string[]).length > 0 && (
                              <div className="flex gap-2 mt-1">
                                {(item.screenshots as string[]).map((s, i) => (
                                  <a key={i} href={`/api/v1/collaboration/regression-runs/screenshots/${activeRun.id}/${s.split('/').pop()}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-white border border-[var(--hairline)] rounded text-xs text-[var(--primary)] hover:underline">
                                    📎 截图 {i + 1}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <button onClick={() => { setActiveRun(null); setActiveRunId(null); loadRegSuites(); }} className="px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs hover:bg-white">
                        {activeRun.status === 'completed' ? '关闭' : '稍后继续'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Loading */}
                {tcLoading && (
                  <div className="text-center py-12">
                    <Loader2 size={32} className="animate-spin mx-auto mb-4 text-[var(--primary)]" />
                    <p className="text-[var(--ink-muted-80)]">加载测试用例...</p>
                  </div>
                )}

                {/* Empty */}
                {!tcLoading && testCases.length === 0 && !showTcForm && (
                  <div className="text-center py-12 text-[var(--ink-muted-80)]">
                    <FlaskConical size={48} className="mx-auto mb-4 opacity-30" />
                    <p>暂无测试用例</p>
                    <p className="text-xs mt-1">点击"AI 生成测试用例"自动生成，或"手动添加"</p>
                  </div>
                )}

                {/* Test Case List */}
                {!tcLoading && testCases.map((tc) => (
                  <div
                    key={tc.id}
                    className="bg-[var(--canvas-parchment)] rounded-[var(--radius-md)] overflow-hidden"
                  >
                    <div className="flex items-start justify-between p-4">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        {/* Source badge */}
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                          tc.source === 'AI'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {tc.source === 'AI' ? <><Sparkles size={10} /> AI</> : '手动'}
                        </span>
                        {/* Priority badge */}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                          tc.priority === 'P0' ? 'bg-red-100 text-red-700' :
                          tc.priority === 'P1' ? 'bg-orange-100 text-orange-700' :
                          tc.priority === 'P3' ? 'bg-gray-100 text-gray-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {tc.priority}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--ink)]">{tc.caseNo} {tc.title}</p>
                          <div className="mt-2 space-y-1 text-xs text-[var(--ink-muted-80)]">
                            {tc.precondition && (
                              <p>
                                <span className="text-[var(--ink-muted-48)]">前置条件：</span>
                                {tc.precondition}
                              </p>
                            )}
                            <div>
                              <span className="text-[var(--ink-muted-48)]">测试步骤：</span>
                              <table className="w-full mt-1 text-xs border-collapse">
                                <thead>
                                  <tr className="bg-[var(--canvas)]">
                                    <th className="p-2 border border-[var(--hairline)] text-left w-16">步骤</th>
                                    <th className="p-2 border border-[var(--hairline)] text-left">操作</th>
                                    <th className="p-2 border border-[var(--hairline)] text-left">预期结果</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(tc.steps as TestCaseStep[]).map((s) => (
                                    <tr key={s.step} className="border-b border-[var(--hairline)]">
                                      <td className="p-2 border border-[var(--hairline)] text-center">{s.step}</td>
                                      <td className="p-2 border border-[var(--hairline)]">{s.action}</td>
                                      <td className="p-2 border border-[var(--hairline)]">{s.expected}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                        {tc.source === 'manual' && (
                          <button
                            onClick={() => openEditTcForm(tc)}
                            className="p-1 text-[var(--primary)] hover:bg-[var(--canvas)] rounded transition-colors"
                            title="编辑"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteManualTc(tc.id)}
                          className="p-1 text-[var(--destructive)] hover:bg-[var(--canvas)] rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* ===== Test Run Section ===== */}
                    <div className="border-t border-[var(--hairline)]">
                      <button
                        onClick={() => toggleTcExpand(tc.id)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[var(--ink-muted-80)] hover:bg-[var(--canvas)] transition-colors"
                      >
                        {expandedTcId === tc.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        执行记录 {testRuns[tc.id]?.length ? `(${testRuns[tc.id].length})` : ''}
                      </button>

                      {expandedTcId === tc.id && (
                        <div className="px-4 pb-3 space-y-2">
                          {/* Run form */}
                          {showRunForm === tc.id ? (
                            <div className="p-3 bg-[var(--canvas)] rounded-[var(--radius-md)] space-y-2">
                              <div className="flex items-center gap-3">
                                <select
                                  value={runForm.status}
                                  onChange={e => setRunForm(p => ({ ...p, status: e.target.value }))}
                                  className="px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs bg-white"
                                >
                                  <option value="passed">✅ 通过</option>
                                  <option value="failed">❌ 失败</option>
                                  <option value="blocked">🚫 阻塞</option>
                                  <option value="pending">⏳ 待执行</option>
                                </select>
                                <span className="text-xs text-[var(--ink-muted-80)]">{new Date().toLocaleString()}</span>
                              </div>
                              <textarea
                                placeholder="测试结果备注..."
                                value={runForm.result}
                                onChange={e => setRunForm(p => ({ ...p, result: e.target.value }))}
                                rows={2}
                                className="w-full px-3 py-2 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs bg-white resize-y"
                              />
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs cursor-pointer hover:bg-[var(--canvas)]">
                                  <Upload size={12} />
                                  上传截图
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => { if (e.target.files) setRunFiles(Array.from(e.target.files)); }}
                                  />
                                </label>
                                {runFiles.length > 0 && (
                                  <span className="text-xs text-[var(--ink-muted-80)]">{runFiles.length} 个文件</span>
                                )}
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => { setShowRunForm(null); setRunFiles([]); }}
                                  className="px-3 py-1.5 border border-[var(--hairline)] rounded-[var(--radius-md)] text-xs hover:bg-white"
                                >
                                  取消
                                </button>
                                <button
                                  onClick={() => handleSubmitRun(tc.id)}
                                  disabled={runSubmitting}
                                  className="px-3 py-1.5 bg-[var(--primary)] text-white rounded-[var(--radius-md)] text-xs hover:bg-[var(--primary-focus)] disabled:opacity-50"
                                >
                                  {runSubmitting ? '提交中...' : '记录结果'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowRunForm(tc.id)}
                              className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-[var(--hairline)] rounded-[var(--radius-md)] text-xs text-[var(--primary)] hover:bg-[var(--canvas)] w-full justify-center"
                            >
                              <Plus size={12} /> 记录测试结果
                            </button>
                          )}

                          {/* Run history */}
                          {(testRuns[tc.id] || []).map((run) => (
                            <div key={run.id} className="flex items-start gap-3 p-2 rounded-[var(--radius-md)] bg-[var(--canvas)]">
                              <span className="text-sm flex-shrink-0 mt-0.5">
                                {run.status === 'passed' ? '✅' : run.status === 'failed' ? '❌' : run.status === 'blocked' ? '🚫' : '⏳'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${
                                    run.status === 'passed' ? 'text-green-600' :
                                    run.status === 'failed' ? 'text-red-600' :
                                    run.status === 'blocked' ? 'text-orange-600' : 'text-gray-500'
                                  }`}>
                                    {run.status === 'passed' ? '通过' : run.status === 'failed' ? '失败' : run.status === 'blocked' ? '阻塞' : '待执行'}
                                  </span>
                                  <span className="text-xs text-[var(--ink-muted-80)]">{run.createdBy}</span>
                                  <span className="text-xs text-[var(--ink-muted-48)]">{run.createdAt?.slice(0, 16).replace('T', ' ')}</span>
                                </div>
                                {run.result && <p className="text-xs text-[var(--ink)] mt-1">{run.result}</p>}
                                {run.screenshots && (run.screenshots as string[]).length > 0 && (
                                  <div className="flex gap-2 mt-1 flex-wrap">
                                    {(run.screenshots as string[]).map((s, i) => (
                                      <a
                                        key={i}
                                        href={`/api/v1/collaboration/test-runs/screenshots/${run.id}/${s.split('/').pop()}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 px-2 py-0.5 bg-white border border-[var(--hairline)] rounded text-xs text-[var(--primary)] hover:underline"
                                      >
                                        📎 截图 {i + 1}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteRun(run.id, tc.id)}
                                className="p-0.5 text-[var(--destructive)] hover:bg-white rounded flex-shrink-0"
                                title="删除记录"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}

                          {(!testRuns[tc.id] || testRuns[tc.id].length === 0) && !showRunForm && (
                            <p className="text-xs text-[var(--ink-muted-48)] text-center py-2">暂无执行记录</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Footer stats */}
                {!tcLoading && testCases.length > 0 && (
                  <p className="text-xs text-[var(--ink-muted-80)]">
                    共 {testCases.length} 条 · AI 生成 {testCases.filter(tc => tc.source === 'AI').length} 条 · 手动 {testCases.filter(tc => tc.source === 'manual').length} 条
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Change Dialog */}
      <StatusChangeDialog
        open={showStatusDialog}
        onClose={() => setShowStatusDialog(false)}
        reqId={req.id}
        currentStatus={req.status ?? ''}
        currentStatusColor={req.statusColor ?? null}
        currentAssignee={req.assignee || ''}
        groupName={req.groupName}
        reqTitle={req.title}
        onTransitioned={() => {
          // Refresh requirement data after status change
          getRequirement(req.id).then(setReq).catch(() => {});
        }}
      />
    </div>
  );
}
