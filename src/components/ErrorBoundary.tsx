import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 rounded-2xl bg-slate-900/95 border border-rose-500/40 text-slate-200 text-center max-w-sm mx-auto my-4 shadow-xl">
          <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-rose-200 mb-1">
            {this.props.fallbackTitle || 'Display Error'}
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Something went wrong rendering this view.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              if (this.props.onReset) this.props.onReset();
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-700 inline-flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
