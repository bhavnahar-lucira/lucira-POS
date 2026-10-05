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