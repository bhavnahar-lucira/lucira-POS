'use client';

// Catches a crash in the ROOT LAYOUT itself (Providers, RehydrationGuard,
// SessionProvider, etc.) — src/app/error.jsx only covers segments BELOW the
// root layout, so a crash IN the layout has no boundary without this file.
// Must render its own <html>/<body> since it replaces the root layout
// entirely when it fires.

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{
          display: 'flex', minHeight: '100vh', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '1.5rem',
          padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif',
        }}
        >
          <AlertTriangle size={48} color="#dc2626" aria-hidden="true" />
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', maxWidth: '24rem', marginTop: '0.5rem' }}>
              The app hit an unexpected error and had to stop. Try reloading — if it keeps happening, contact support.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.625rem 1.25rem', borderRadius: '0.5rem',
              background: '#111827', color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
