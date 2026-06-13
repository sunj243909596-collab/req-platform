import { useState, useEffect } from 'react';
import { X, Download, Loader2, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import {
  getExportFields,
  exportRequirements,
  type ExportFieldDef,
} from '../../api/requirements';

interface Props {
  open: boolean;
  onClose: () => void;
  currentFilters: Record<string, unknown>;
  totalCount: number;
}

export function RequirementExportDialog({ open, onClose, currentFilters, totalCount }: Props) {
  const [fields, setFields] = useState<ExportFieldDef[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getExportFields()
      .then((f) => {
        setFields(f);
        // Default: select common fields
        const defaults = new Set(['reqNo', 'title', 'categoryPath', 'priority', 'status', 'module', 'assignee', 'description']);
        setSelectedFields(defaults);
      })
      .catch(() => toast.error('加载导出字段失败'))
      .finally(() => setLoading(false));
  }, [open]);

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFields(new Set(fields.map((f) => f.key)));
  };

  const deselectAll = () => {
    setSelectedFields(new Set());
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) {
      toast.error('请至少选择一个字段');
      return;
    }
    setExporting(true);
    try {
      await exportRequirements(
        Array.from(selectedFields),
        currentFilters
      );
      toast.success(`已导出 ${totalCount} 条需求`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  // Group fields for better UX
  const coreFields = fields.filter((f) => ['reqNo', 'title', 'categoryPath', 'reqType', 'priority', 'status'].includes(f.key));
  const assigneeFields = fields.filter((f) => ['module', 'assignee', 'groupName', 'targetDate', 'tags'].includes(f.key));
  const contentFields = fields.filter((f) => ['background', 'description', 'designSolution'].includes(f.key));
  const otherFields = fields.filter((f) => ['gspImpact', 'relatedTables', 'createdAt', 'updatedAt'].includes(f.key));

  const renderGroup = (title: string, group: ExportFieldDef[]) => (
    <div>
      <h5 className="text-xs font-semibold text-[var(--ink-muted-80)] mb-2 uppercase tracking-wide">{title}</h5>
      <div className="space-y-1">
        {group.map((f) => (
          <button
            key={f.key}
            onClick={() => toggleField(f.key)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--canvas-parchment)] transition-colors text-left"
          >
            {selectedFields.has(f.key) ? (
              <CheckSquare size={16} className="text-[var(--primary)] shrink-0" />
            ) : (
              <Square size={16} className="text-[var(--ink-muted-48)] shrink-0" />
            )}
            <span className="text-sm text-[var(--ink)]">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-[var(--canvas)] rounded-[var(--radius-lg)] w-full max-w-lg mx-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">导出需求为 Excel</h2>
            <p className="text-sm text-[var(--ink-muted-48)] mt-0.5">
              当前筛选条件下共 <span className="font-semibold text-[var(--primary)]">{totalCount}</span> 条需求
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--ink-muted-48)] hover:text-[var(--ink)]">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-[var(--primary)]" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Select all / none */}
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAll}
                  className="text-xs text-[var(--primary)] hover:underline"
                >
                  全选
                </button>
                <span className="text-xs text-[var(--ink-muted-48)]">|</span>
                <button
                  onClick={deselectAll}
                  className="text-xs text-[var(--ink-muted-80)] hover:underline"
                >
                  取消全选
                </button>
                <span className="text-xs text-[var(--ink-muted-48)] ml-auto">
                  已选 {selectedFields.size}/{fields.length} 个字段
                </span>
              </div>

              {/* Field groups */}
              {renderGroup('核心信息', coreFields)}
              {renderGroup('分配与计划', assigneeFields)}
              {renderGroup('详细内容', contentFields)}
              {renderGroup('其他', otherFields)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-[var(--hairline)]">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selectedFields.size === 0}
            className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? '导出中...' : '导出 Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
