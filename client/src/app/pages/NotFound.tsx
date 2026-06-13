import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--canvas-parchment)]">
      <div className="text-center">
        <h1 className="mb-4">404</h1>
        <h3 className="mb-8 text-[var(--ink-muted-80)]">页面未找到</h3>
        <Link
          to="/app/requirements"
          className="inline-block px-6 py-3 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all"
        >
          返回应用
        </Link>
      </div>
    </div>
  );
}
