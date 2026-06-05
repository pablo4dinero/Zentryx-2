import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  label?: string; // e.g. "Production Planning" — shown in the fallback UI
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center rounded-2xl border border-red-500/20 bg-red-500/5">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <div>
          <p className="font-semibold text-foreground">
            Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }
}
