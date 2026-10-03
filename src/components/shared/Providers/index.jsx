// src/components/shared/Providers/index.jsx
// Single wrapper for all application providers.
// Mounted once in src/app/layout.jsx — never duplicated.
// Order matters: Redux → Persist → QueryClient → Toast

'use client';

import { useRef } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from '@/components/ui/sonner';

import { store, persistor } from '@/store';
import queryClient from '@/lib/queryClient';
import { queryPersister, PERSIST_MAX_AGE, PERSIST_BUSTER, shouldPersistQuery } from '@/lib/queryPersister';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

/** @param {{ children: React.ReactNode }} props */
export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <PersistGate
        loading={<LoadingSpinner fullScreen />}
        persistor={persistor}
      >
        {/* Restores only an allow-listed slice of the query cache (catalog
            list + Shopify product images, see lib/queryPersister.js) from
            IndexedDB; all other queries behave as plain in-memory react-query. */}
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: PERSIST_MAX_AGE,
            buster: PERSIST_BUSTER,
            dehydrateOptions: {
              shouldDehydrateQuery: shouldPersistQuery,
            },
          }}
        >

          {children}

          <Toaster duration={3000} />

          {/* TanStack Query DevTools — dev only, removed in production build.
              Wrapped in its own `fixed inset-0` div (pointer-events-none so
              it doesn't block clicks; the devtools' own toggle/panel set
              their own pointer-events back on) so its panel container is
              taken out of body's normal flex-col flow — body has no
              `overflow-hidden` of its own (see globals.css comment history:
              adding it there broke /login's own min-h-screen + body-scroll
              layout on short viewports), so without this, the devtools
              panel container stacked as a real flex sibling below the app
              shell and stretched the whole document, producing a page-level
              scrollbar even while visually collapsed. */}
          <div className="fixed inset-0 z-50 pointer-events-none [&>*]:pointer-events-auto">
            <ReactQueryDevtools
              initialIsOpen={false}
              buttonPosition="bottom-left"
            />
          </div>

        </PersistQueryClientProvider>
      </PersistGate>
    </Provider>
  );
}