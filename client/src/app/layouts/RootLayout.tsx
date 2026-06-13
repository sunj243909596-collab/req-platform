import { Outlet } from 'react-router';
import { Toaster } from '../components/Toaster';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function RootLayout() {
  return (
    <>
      <Toaster />
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </>
  );
}
