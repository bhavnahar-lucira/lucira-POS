'use client';

import { createContext, useContext, useRef, useCallback, useEffect, useMemo } from 'react';

const NavigationGuardContext = createContext(null);

export function NavigationGuardProvider({ children }) {
  const guardRef = useRef(null);

  const setGuard   = useCallback((fn) => { guardRef.current = fn; }, []);
  const clearGuard = useCallback(() => { guardRef.current = null; }, []);
  const runGuard = useCallback(() => {
    if (!guardRef.current) return true;
    return guardRef.current();
  }, []);

  const value = useMemo(
    () => ({ setGuard, clearGuard, runGuard }),
    [setGuard, clearGuard, runGuard],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuardContext() {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) {
    throw new Error('useNavigationGuardContext must be used within NavigationGuardProvider');
  }
  return ctx;
}

/**
 * Registers a guard for as long as the calling component is mounted.
 * @param {() => boolean} guardFn
 */
export function useBackGuard(guardFn) {
  const { setGuard, clearGuard } = useNavigationGuardContext();

  useEffect(() => {
    setGuard(guardFn);
    return () => clearGuard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardFn]);
}
