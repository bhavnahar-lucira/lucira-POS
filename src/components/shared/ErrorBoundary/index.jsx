'use client';

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
