'use client';

// Reusable local error boundary (2026-09-28, reported: the Leads tab
// crashing broke the whole page) — src/app/error.jsx already catches a
// render crash for a WHOLE ROUTE, but that blanks everything on the page,
// not just the one broken panel. This wraps a single risky panel (a tab,
// a widget fed by a live third-party API) so a crash there shows a small
// inline "something went wrong" card with a retry, while the rest of the
// page — search bars, other tabs, navigation — keeps working.
//
// Must be a class component: componentDidCatch/getDerivedStateFromError
// have no hook equivalent in React.
//
// `resetKey`: pass something that changes when the user picks a different
// view (e.g. the active tab) — changing it remounts the boundary, so
// switching away from and back to a broken tab doesn't stay stuck on the
// old error state.

import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

class ErrorBoundaryInner extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    const { error } = this.state;
    const { fallbackTitle, children } = this.props;

    if (!error) return children;

    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
        <AlertTriangle size={32} className="text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{fallbackTitle ?? 'Something went wrong.'}</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            This section hit an error and couldn&apos;t load. The rest of the page is unaffected.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => this.setState({ error: null })}>
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }
}

export default function ErrorBoundary({ resetKey, fallbackTitle, children }) {
  return (
    <ErrorBoundaryInner key={resetKey} fallbackTitle={fallbackTitle}>
      {children}
    </ErrorBoundaryInner>
  );
}
