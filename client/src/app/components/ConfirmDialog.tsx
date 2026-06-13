import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'warning',
}: ConfirmDialogProps) {
  const variantColors = {
    danger: 'var(--destructive)',
    warning: '#ff9500',
    info: 'var(--primary)',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-[var(--canvas)] rounded-[var(--radius-lg)] shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 border-b border-[var(--hairline)]">
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${variantColors[variant]}20` }}
                  >
                    <AlertTriangle size={24} style={{ color: variantColors[variant] }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[var(--ink)] mb-2">{title}</h3>
                    <p className="text-sm text-[var(--ink-muted-80)]">{description}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-[var(--canvas-parchment)] rounded-[var(--radius-sm)] transition-colors"
                  >
                    <X size={20} className="text-[var(--ink-muted-80)]" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-[var(--canvas-parchment)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--muted)] transition-colors"
                >
                  {cancelText}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className="px-6 py-3 text-white rounded-[var(--radius-pill)] hover:opacity-90 transition-all active:scale-95"
                  style={{ backgroundColor: variantColors[variant] }}
                >
                  {confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
