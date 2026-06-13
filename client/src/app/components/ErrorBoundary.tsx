/// <reference types="vite/client" />
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--canvas-parchment)] px-6">
          <div className="max-w-md text-center">
            <div className="w-20 h-20 bg-[#fff3cd] rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={40} className="text-[#ff9500]" strokeWidth={1.5} />
            </div>
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-3">页面出现错误</h2>
            <p className="text-[var(--ink-muted-80)] mb-6 text-sm leading-relaxed">
              {this.state.error?.message || '发生了一个未预期的错误，请尝试刷新页面或返回首页。'}
            </p>
            {import.meta.env.DEV && this.state.error?.stack && (
              <pre className="text-left text-xs bg-[var(--canvas)] border border-[var(--hairline)] rounded-[var(--radius-md)] p-4 mb-6 overflow-auto max-h-40 text-[var(--destructive)]">
                {this.state.error.stack}
              </pre>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--primary)] text-white rounded-[var(--radius-pill)] hover:bg-[var(--primary-focus)] transition-all active:scale-95"
              >
                <RefreshCw size={16} /> 重新加载
              </button>
              <a
                href="/app/requirements"
                className="flex items-center gap-2 px-5 py-2.5 bg-[var(--canvas)] border border-[var(--hairline)] text-[var(--ink)] rounded-[var(--radius-pill)] hover:bg-[var(--canvas-parchment)] transition-colors"
              >
                <Home size={16} /> 返回首页
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
