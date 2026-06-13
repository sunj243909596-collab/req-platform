import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--canvas)',
          color: 'var(--ink)',
          border: '1px solid var(--hairline)',
          borderRadius: '11px',
          fontFamily: 'SF Pro Text, system-ui, -apple-system, sans-serif',
        },
        className: 'sonner-toast',
      }}
      richColors
    />
  );
}
