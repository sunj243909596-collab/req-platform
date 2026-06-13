import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, ArrowRight, User, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { transitionRequirement } from '../../api/requirements';
import { listWorkflows, type WorkflowDefinition } from '../../api/settings';
import { searchUsers } from '../../api/users';
import { authStore } from '../../stores/auth';

interface Props {
  open: boolean;
  onClose: () => void;
  reqId: number;
  currentStatus: string;
  /** 当前状态颜色(从后端 statusColor 字段传入) */
  currentStatusColor?: string | null;
  currentAssignee: string;
  groupName: string;
  reqTitle: string;
  onTransitioned: () => void;
}

interface MentionUser {
  id: number;
  username: string;
  displayName: string;
}

// 优先用后端注入的 statusColor(来自 WorkflowStatus.color),没配再掉 fallback
const STATUS_COLORS_FALLBACK: Record<string, string> = {
  '待评审': '#6c757d', '评审中': '#17a2b8', '设计中': '#ffc107',
  '开发中': '#0066cc', '测试中': '#fd7e14', '已完成': '#28a745',
};
function pickStatusColor(color: string | null | undefined, name: string): string {
  return color || STATUS_COLORS_FALLBACK[name] || '#6c757d';
}

export function StatusChangeDialog({
  open, onClose, reqId, currentStatus, currentStatusColor, currentAssignee, groupName, reqTitle, onTransitioned,
}: Props) {
  const [allowedTargets, setAllowedTargets] = useState<string[]>([]);
  // 维护 statusName → color 的索引(从 listWorkflows() 抓的 color 也算 db 来源)
  const [statusColorByName, setStatusColorByName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [targetStatus, setTargetStatus] = useState('');
  const [assignee, setAssignee] = useState(currentAssignee || '');
  const [comment, setComment] = useState('');

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTargetStatus('');
    setAssignee(authStore.currentUser?.username || '');
    setComment('');
    setMentionQuery(null);
    setMentionResults([]);

    // Load enabled workflows for the requirement's group
    // Then find the first enabled workflow and get allowed target statuses
    // We pass groupId=0 to get all, then filter client-side, or use a dedicated API
    // For simplicity, fetch all available transitions from the new workflow API
    listWorkflows(undefined)  // Get all workflows
      .then((workflows) => {
        // For now, find the first enabled workflow and use its transitions
        // In a production environment, we'd look up by groupId
        const enabledWfs = workflows.filter(wf => wf.enabled);
        if (enabledWfs.length === 0) { setAllowedTargets([]); return; }
        // Use the first enabled workflow's statuses and transitions
        const wf = enabledWfs[0];
        // 收集该 workflow 的所有 status name -> color 索引
        const colorMap: Record<string, string> = {};
        for (const s of wf.statuses) {
          if (s.color) colorMap[s.name] = s.color;
        }
        setStatusColorByName(colorMap);
        const currentStatusObj = wf.statuses.find(s => s.name === currentStatus);
        if (!currentStatusObj) { setAllowedTargets([]); return; }
        const targets = wf.transitions
          .filter(t => t.fromStatusId === currentStatusObj.id)
          .map(t => wf.statuses.find(s => s.id === t.toStatusId)?.name)
          .filter(Boolean) as string[];
        setAllowedTargets(targets);
        if (targets.length === 1) setTargetStatus(targets[0]);
      })
      .catch(() => setAllowedTargets([]))
      .finally(() => setLoading(false));
  }, [open, currentStatus, groupName]);

  // @mention search
  const searchMentions = useCallback((query: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchUsers(query)
        .then(setMentionResults)
        .catch(() => setMentionResults([]));
    }, 150);
  }, []);

  // Detect @ trigger in textarea
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setComment(value);

    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);

    // Find the last @ before cursor that isn't followed by a space
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1];
      if (query.length >= 0) {
        setMentionQuery(query);
        setMentionIdx(0);
        searchMentions(query);
        return;
      }
    }
    setMentionQuery(null);
    setMentionResults([]);
  };

  // Insert @mention into textarea
  const insertMention = (username: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = comment.slice(0, cursorPos);
    const textAfterCursor = comment.slice(cursorPos);

    // Replace the @query part
    const atPos = textBeforeCursor.lastIndexOf('@');
    const newBefore = textBeforeCursor.slice(0, atPos) + `@${username} `;
    const newComment = newBefore + textAfterCursor;

    setComment(newComment);
    setMentionQuery(null);
    setMentionResults([]);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = newBefore.length;
    }, 0);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!mentionQuery && mentionResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIdx((prev) => Math.min(prev + 1, mentionResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (mentionResults.length > 0) {
        e.preventDefault();
        insertMention(mentionResults[mentionIdx].username);
      }
    } else if (e.key === 'Escape') {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const handleSubmit = async () => {
    if (!targetStatus) { toast.error('请选择目标状态'); return; }
    setSubmitting(true);
    try {
      await transitionRequirement(reqId, {
        status: targetStatus,
        assignee: assignee || undefined,
        comment: comment.trim() || undefined,
      });
      toast.success(`状态已变更：${currentStatus} → ${targetStatus}`);
      onTransitioned();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '变更失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-[var(--canvas)] rounded-[var(--radius-lg)] w-full max-w-md mx-4 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">状态变更</h2>
            <p className="text-xs text-[var(--ink-muted-48)] mt-0.5 truncate max-w-[300px]">{reqTitle}</p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-muted-48)] hover:text-[var(--ink)]">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={20} className="animate-spin text-[var(--primary)]" />
            </div>
          ) : (
            <>
              {/* Current → Target status */}
              <div className="flex items-center gap-3 p-3 bg-[var(--canvas-parchment)] rounded-[var(--radius-md)]">
                <span className="px-3 py-1.5 rounded-full text-sm font-semibold text-white"
                  style={{ backgroundColor: pickStatusColor(currentStatusColor, currentStatus) }}>
                  {currentStatus}
                </span>
                <ArrowRight size={16} className="text-[var(--ink-muted-48)]" />
                {allowedTargets.length > 0 ? (
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    className="px-3 py-1.5 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">选择目标状态</option>
                    {allowedTargets.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-[var(--ink-muted-48)]">
                    {currentStatus === '已完成' ? '已是终态，无法变更' : '当前状态无可用流转'}
                  </span>
                )}
              </div>

              {/* Assignee */}
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-sm text-[var(--ink)]">
                  <User size={14} className="text-[var(--ink-muted-48)]" />
                  处理人
                </label>
                <input
                  type="text"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="输入处理人用户名（默认当前用户）"
                  className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Comment with @mention */}
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-sm text-[var(--ink)]">
                  <MessageSquare size={14} className="text-[var(--ink-muted-48)]" />
                  变更说明 <span className="text-xs text-[var(--ink-muted-48)]">（支持 @用户名 提及他人）</span>
                </label>
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={handleCommentChange}
                    onKeyDown={handleKeyDown}
                    placeholder="填写状态变更原因或备注...&#10;输入 @ 可以提及他人"
                    className="w-full px-3 py-2 bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                    rows={4}
                  />
                  {/* @mention dropdown */}
                  {mentionResults.length > 0 && (
                    <div className="absolute left-0 bottom-full mb-1 w-56 max-h-40 overflow-y-auto bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] shadow-lg z-10">
                      {mentionResults.map((u, i) => (
                        <button
                          key={u.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); insertMention(u.username); }}
                          onMouseEnter={() => setMentionIdx(i)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                            i === mentionIdx ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-[var(--ink)] hover:bg-[var(--canvas-parchment)]'
                          }`}
                        >
                          <span className="w-6 h-6 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center text-xs font-semibold">
                            {u.displayName?.charAt(0) || u.username.charAt(0)}
                          </span>
                          <div>
                            <span className="font-medium">{u.displayName || u.username}</span>
                            <span className="text-[var(--ink-muted-48)] ml-1 text-xs">@{u.username}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-[var(--hairline)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !targetStatus}
            className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? '变更中...' : '确认变更'}
          </button>
        </div>
      </div>
    </div>
  );
}
