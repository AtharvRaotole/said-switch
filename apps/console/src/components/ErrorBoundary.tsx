import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps a rendering bug from blanking the page during a demo; retries on the next data update. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: unknown }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Said Console render error', error, info.componentStack);
  }

  override componentDidUpdate(prev: { resetKey: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mt-8 rounded-[6px] border border-fail/40 bg-fail-wash px-6 py-5 text-ink-2">
        <p className="font-display text-[20px] font-semibold text-fail">This view could not render the latest ledger</p>
        <p className="mt-1 text-[13px]">
          The data is untouched; the console is read-only. It will try again on the next update. Details:{' '}
          <code className="font-mono text-[12px]">{this.state.error.message}</code>
        </p>
      </div>
    );
  }
}
