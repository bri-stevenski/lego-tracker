import { useEffect, useRef, useState } from 'react';
import {
  ensureAnonymousSession,
  getSessionSnapshot,
  linkEmailIdentity,
  onSessionChange,
} from '@anti-kragle/core';
import type { LinkResult } from '@anti-kragle/core';

export type BackupState = 'initializing' | 'backed-up' | 'backing-up' | 'offline' | 'error';

export interface UseAuth {
  userId: string | null;
  isAnonymous: boolean;
  sessionReady: boolean;
  backupState: BackupState;
  linkEmail: (email: string) => Promise<LinkResult>;
}

export function useAuth(): UseAuth {
  const [snapshot, setSnapshot] = useState(() => getSessionSnapshot());
  const [sessionReady, setSessionReady] = useState(false);
  const [backupState, setBackupState] = useState<BackupState>('initializing');
  const started = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    // Track mount state via a ref (not a captured boolean): the bootstrap runs
    // once (started guard), but under StrictMode React does mount → cleanup →
    // remount on the same instance. A captured `active=false` from the first
    // (cleaned-up) invocation would strand the single bootstrap; reading the
    // shared ref at resolve time sees the remount's `true` instead.
    mounted.current = true;

    // Reflect account-link returns (magic-link) without importing the client:
    // the same uid flips isAnonymous → false once linking completes (SC5).
    const unsubscribe = onSessionChange(setSnapshot);

    if (!started.current) {
      started.current = true;
      void (async () => {
        const result = await ensureAnonymousSession();
        if (!mounted.current) return; // unmounted mid-bootstrap — skip state updates
        setSnapshot(getSessionSnapshot());
        setSessionReady(true);
        setBackupState(result.ok ? 'backed-up' : 'error'); // fail-open (D6/SC9)
      })();
    }

    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  return {
    userId: snapshot.userId,
    isAnonymous: snapshot.isAnonymous,
    sessionReady,
    backupState,
    linkEmail: linkEmailIdentity,
  };
}
