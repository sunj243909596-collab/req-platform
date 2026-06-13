import { useState, useCallback } from 'react';
import { Upload, Download, X, Loader2, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  downloadImportTemplate,
  previewImport,
  confirmImport,
  type ImportPreviewRow,
  type ImportPreviewResult,
  type ImportResult,
} from '../../api/requirements';

type Step = 'upload' | 'preview' | 'result';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const statusRowColors: Record<string, string> = {
  valid: 'bg-emerald-50 border-emerald-200',
  invalid: 'bg-red-50 border-red-200',
  duplicate: 'bg-amber-50 border-amber-200',
};

const statusIconColors: Record<string, string> = {
  valid: 'text-emerald-600',
  invalid: 'text-red-600',
  duplicate: 'text-amber-600',
};

export function RequirementImportDialog({ open, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setParsing(false);
    setPreview(null);
    setImporting(false);
    setResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.match(/\.xlsx?$/i)) {
      toast.error('请上传 .xlsx 格式的 Excel 文件');
      return;
    }
    setFile(f);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!file) { toast.error('请先选择文件'); return; }
    setParsing(true);
    try {
      const res = await previewImport(file);
      setPreview(res);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解析失败');
    } finally {
      setParsing(false);
    }
  }, [file]);

  const handleConfirmImport = useCallback(async () => {
    if (!preview || !file) return;
    if (preview.validCount === 0) {
      toast.error('没有可导入的有效数据行');
      return;
    }
    setImporting(true);
    try {
      // The server re-validates the file from scratch, so we pass the file
      // (not preview.rows) to prevent any tampering on the client side.
      const res = await confirmImport(file);
      setResult(res);
      setStep('result');
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败');
    } finally {
      setImporting(false);
    }
  }, [preview, file, onImported]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="bg-[var(--canvas)] rounded-[var(--radius-lg)] w-full max-w-3xl mx-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hairline)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Excel 批量导入需求</h2>
            <p className="text-sm text-[var(--ink-muted-48)] mt-0.5">
              {step === 'upload' && '上传 Excel 文件并预览校验结果'}
              {step === 'preview' && `共 ${preview?.totalRows} 行数据，请确认导入`}
              {step === 'result' && '导入完成'}
            </p>
          </div>
          <button onClick={handleClose} className="text-[var(--ink-muted-48)] hover:text-[var(--ink)]">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ================= Step 1: Upload ================= */}
          {step === 'upload' && (
            <div className="space-y-5">
              {/* Upload area */}
              <label
                className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--hairline)] rounded-[var(--radius-md)] py-12 cursor-pointer hover:border-[var(--primary)] transition-colors"
              >
                <Upload size={32} className="text-[var(--ink-muted-48)] mb-3" />
                {file ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-[var(--ink)]">{file.name}</p>
                    <p className="text-xs text-[var(--ink-muted-48)] mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[var(--ink-muted-80)]">
                      点击或拖拽上传 <span className="text-[var(--primary)]">.xlsx</span> 文件
                    </p>
                    <p className="text-xs text-[var(--ink-muted-48)] mt-1">单次最多 500 行</p>
                  </>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {/* Download template */}
              <div className="flex items-center justify-center">
                <button
                  onClick={downloadImportTemplate}
                  className="flex items-center gap-2 text-sm text-[var(--primary)] hover:underline"
                >
                  <Download size={14} />
                  下载导入模板
                </button>
              </div>
            </div>
          )}

          {/* ================= Step 2: Preview ================= */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle size={14} /> 有效 {preview.validCount} 行
                </span>
                <span className="flex items-center gap-1.5 text-red-600">
                  <AlertCircle size={14} /> 无效 {preview.invalidCount} 行
                </span>
                <span className="flex items-center gap-1.5 text-amber-600">
                  <AlertTriangle size={14} /> 重复 {preview.duplicateCount} 行
                </span>
              </div>

              {/* Table */}
              <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="data-table w-full text-sm">
                    <thead className="bg-[var(--canvas-parchment)] sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)] w-12">行</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)] w-16">状态</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)]">分类</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)] w-20">需求类型</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)] w-28">需求编码</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)]">标题</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)] w-16">优先级</th>
                        <th className="px-3 py-2 text-left font-semibold text-[var(--ink)]">错误信息</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--hairline)]">
                      {preview.rows.map((row) => (
                        <tr key={row.rowNumber} className={statusRowColors[row.status]}>
                          <td className="px-3 py-2 text-[var(--ink-muted-80)] font-mono">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            {row.status === 'valid' && <CheckCircle size={14} className={statusIconColors.valid} />}
                            {row.status === 'invalid' && <AlertCircle size={14} className={statusIconColors.invalid} />}
                            {row.status === 'duplicate' && <AlertTriangle size={14} className={statusIconColors.duplicate} />}
                          </td>
                          <td className="px-3 py-2 max-w-[120px] truncate text-[var(--ink-muted-80)]">
                            {(row.data as { categoryName?: string }).categoryName || '-'}
                          </td>
                          <td className="px-3 py-2 text-[var(--ink-muted-80)] text-xs">
                            {(row.data as { reqTypeLabel?: string }).reqTypeLabel || '-'}
                          </td>
                          <td className="px-3 py-2 text-[var(--ink)] text-xs font-mono">
                            {row.data.reqNo || '-'}
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-[var(--ink)]">
                            {row.data.title || '-'}
                          </td>
                          <td className="px-3 py-2 text-[var(--ink-muted-80)]">
                            {row.data.priority || '-'}
                          </td>
                          <td className="px-3 py-2 max-w-[180px] truncate text-red-500 text-xs">
                            {row.errors.length > 0 ? row.errors.join('；') : row.status === 'duplicate' ? '与已有需求重复' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================= Step 3: Result ================= */}
          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle size={20} />
                <span className="font-semibold">导入完成</span>
              </div>

              <div className="space-y-2 text-sm">
                <p>
                  成功导入 <span className="font-semibold text-emerald-600">{result.successCount}</span> 条需求
                </p>
                {result.skipCount > 0 && (
                  <p>
                    跳过 <span className="font-semibold text-amber-600">{result.skipCount}</span> 行
                  </p>
                )}
              </div>

              {/* Created list */}
              {result.createdRequirements.length > 0 && (
                <div className="border border-[var(--hairline)] rounded-[var(--radius-md)] overflow-hidden">
                  <div className="bg-[var(--canvas-parchment)] px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                    已导入的需求
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    <table className="data-table w-full text-sm">
                      <thead className="bg-[var(--canvas-parchment)] sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-[var(--ink)]">编号</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-[var(--ink)]">标题</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--hairline)]">
                        {result.createdRequirements.map((r) => (
                          <tr key={r.id}>
                            <td className="px-3 py-1.5 font-mono text-[var(--primary)] text-xs">{r.reqNo}</td>
                            <td className="px-3 py-1.5 text-[var(--ink)] truncate max-w-[300px]">{r.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error list */}
              {result.errors.length > 0 && (
                <div className="border border-red-200 rounded-[var(--radius-md)] overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
                    导入失败的行
                  </div>
                  <div className="max-h-[150px] overflow-y-auto">
                    <table className="data-table w-full text-sm">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-semibold text-red-600">行</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-red-600">标题</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-red-600">错误</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {result.errors.map((e) => (
                          <tr key={e.rowNumber}>
                            <td className="px-3 py-1.5 font-mono text-xs">{e.rowNumber}</td>
                            <td className="px-3 py-1.5 truncate max-w-[150px]">{e.title}</td>
                            <td className="px-3 py-1.5 text-red-500 text-xs">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-[var(--hairline)]">
          {step === 'upload' && (
            <>
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
              >
                取消
              </button>
              <button
                onClick={handlePreview}
                disabled={!file || parsing}
                className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {parsing && <Loader2 size={14} className="animate-spin" />}
                {parsing ? '解析中...' : '解析并预览'}
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                onClick={() => { setStep('upload'); setPreview(null); }}
                className="px-5 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
              >
                返回重新上传
              </button>
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm border border-[var(--hairline)] rounded-[var(--radius-md)] hover:bg-[var(--canvas-parchment)]"
              >
                取消
              </button>
              {preview && preview.validCount > 0 && (
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {importing && <Loader2 size={14} className="animate-spin" />}
                  {importing ? '导入中...' : `确认导入（${preview.validCount} 行）`}
                </button>
              )}
            </>
          )}
          {step === 'result' && (
            <button
              onClick={handleClose}
              className="px-5 py-2 text-sm bg-[var(--primary)] text-white rounded-[var(--radius-md)] hover:bg-[var(--primary-focus)]"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
