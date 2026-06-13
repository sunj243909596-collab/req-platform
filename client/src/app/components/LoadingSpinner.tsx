import { motion } from 'motion/react';

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <motion.div
        className="w-12 h-12 border-4 border-[var(--canvas-parchment)] border-t-[var(--primary)] rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
