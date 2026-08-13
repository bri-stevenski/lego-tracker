import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';

vi.mock('@anti-kragle/core', () => ({
  ensureAnonymousSession: vi.fn(),
  getSessionSnapshot: vi.fn(),
  linkEmailIdentity: vi.fn(),
  onSessionChange: vi.fn(),
}));

import { ensureAnonymousSession, getSessionSnapshot, onSessionChange } from '@anti-kragle/core';
import { useAuth } from './useAuth';

const mockEnsure = vi.mocked(ensureAnonymousSession);
const mockSnapshot = vi.mocked(getSessionSnapshot);
const mockOnSessionChange = vi.mocked(onSessionChange);

beforeEach(() => {
  vi.clearAllMocks();
  mockOnSessionChange.mockReturnValue(() => {});
});

describe('useAuth', () => {
  it('bootstraps an anon session and reports backed-up', async () => {
    mockSnapshot
      .mockReturnValueOnce({ userId: null, isAnonymous: false })
      .mockReturnValue({ userId: 'anon-1', isAnonymous: true });
    mockEnsure.mockResolvedValue({ ok: true, userId: 'anon-1', isAnonymous: true });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.userId).toBe('anon-1');
    expect(result.current.isAnonymous).toBe(true);
    expect(result.current.backupState).toBe('backed-up');
  });

  it('fails open to error state without crashing (SC9)', async () => {
    mockSnapshot.mockReturnValue({ userId: null, isAnonymous: false });
    mockEnsure.mockResolvedValue({ ok: false, reason: 'anon-disabled' });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.backupState).toBe('error');
  });

  it('reflects an account-link return, preserving the uid (SC5)', async () => {
    mockSnapshot.mockReturnValue({ userId: 'anon-1', isAnonymous: true });
    mockEnsure.mockResolvedValue({ ok: true, userId: 'anon-1', isAnonymous: true });
    let emit: ((s: { userId: string | null; isAnonymous: boolean }) => void) | undefined;
    mockOnSessionChange.mockImplementation((cb) => {
      emit = cb;
      return () => {};
    });

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.isAnonymous).toBe(true);

    // Magic-link return completes the link: same uid, no longer anonymous.
    act(() => emit?.({ userId: 'anon-1', isAnonymous: false }));

    expect(result.current.isAnonymous).toBe(false);
    expect(result.current.userId).toBe('anon-1');
  });

  it('does not update state after unmount during bootstrap (N2)', async () => {
    mockSnapshot.mockReturnValue({ userId: 'anon-1', isAnonymous: true });
    let resolveEnsure!: (v: { ok: true; userId: string; isAnonymous: boolean }) => void;
    mockEnsure.mockReturnValue(
      new Promise(res => {
        resolveEnsure = res;
      }),
    );

    const { unmount } = renderHook(() => useAuth());

    // Bootstrap is suspended at `await ensureAnonymousSession()`.
    const snapshotCallsBeforeUnmount = mockSnapshot.mock.calls.length;
    unmount();

    // Session resolves AFTER unmount. The post-await block must be gated:
    // getSessionSnapshot() must not run and no setState may fire.
    await act(async () => {
      resolveEnsure({ ok: true, userId: 'anon-1', isAnonymous: true });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockSnapshot.mock.calls.length).toBe(snapshotCallsBeforeUnmount);
  });

  it('reaches sessionReady under StrictMode mount/cleanup/remount (N2 regression)', async () => {
    mockSnapshot.mockReturnValue({ userId: 'anon-1', isAnonymous: true });
    mockEnsure.mockResolvedValue({ ok: true, userId: 'anon-1', isAnonymous: true });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });

    // StrictMode double-invokes the effect (mount → cleanup → remount) on the
    // same instance; the `started` ref must not let the mount-guard strand the
    // single bootstrap. sessionReady must still flip true.
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    expect(result.current.backupState).toBe('backed-up');
  });

  it('unsubscribes from session changes on unmount', async () => {
    mockSnapshot.mockReturnValue({ userId: 'anon-1', isAnonymous: true });
    mockEnsure.mockResolvedValue({ ok: true, userId: 'anon-1', isAnonymous: true });
    const unsub = vi.fn();
    mockOnSessionChange.mockReturnValue(unsub);

    const { unmount, result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.sessionReady).toBe(true));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
