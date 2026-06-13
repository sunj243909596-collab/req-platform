import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setTimeout(() => setWasOffline(false), 3000);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  if (isOnline && !wasOffline) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -48, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
          isOnline
            ? 'bg-[#28a745] text-white'
            : 'bg-[#dc3545] text-white'
        }`}
      >
        {isOnline ? (
          <>
            <Wifi size={16} /> 网络已恢复
          </>
        ) : (
          <>
            <WifiOff size={16} /> 网络已断开，请检查网络连接
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
