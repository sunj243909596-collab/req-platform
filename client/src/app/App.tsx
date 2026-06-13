import { RouterProvider } from 'react-router';
import { router } from './routes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OfflineBanner } from './components/OfflineBanner';

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
