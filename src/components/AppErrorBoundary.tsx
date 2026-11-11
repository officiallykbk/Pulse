import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Application recovery boundary caught render error:', error.message, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen w-full flex-col items-center justify-center bg-black px-6 text-center text-white"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">Something interrupted playback</h1>
          <p className="mt-1.5 max-w-xs text-xs text-white/60 leading-relaxed">
            A browser extension or temporary glitch interrupted this screen. Reload to restore Pulse.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reload Pulse</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
