import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncStatus } from '@anti-kragle/core';
import { reconcile } from '../services/reconcile';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSync(sessionReady: boolean): {
  status: SyncStatus;
  errorReason: string | null;
  triggerSync: () => void;
} {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    setStatus('syncing');
    try {
      await reconcile();
      setErrorReason(null);
      setStatus('idle');
    } catch (err) {
      setErrorReason(err instanceof Error ? err.message : 'unknown');
      setStatus('error');
    }
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(runSync, SYNC_INTERVAL_MS);
  }, [runSync]);

  useEffect(() => {
    if (!sessionReady) return;

    function handleOnline() {
      setStatus('idle');
      runSync();
      startInterval();
    }

    function handleOffline() {
      setStatus('offline');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Register connectivity listeners unconditionally so a session that starts
    // offline still recovers (runs its first sync) once the browser comes online.
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
      runSync();
      startInterval();
    } else {
      setStatus('offline');
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sessionReady, runSync, startInterval]);

  return { status, errorReason, triggerSync: runSync };
}
