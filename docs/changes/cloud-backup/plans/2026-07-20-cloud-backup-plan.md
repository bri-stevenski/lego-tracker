# Plan: Anonymous Cloud Backup with Optional Account-Linking

**Date:** 2026-07-20 | **Spec:** `docs/changes/cloud-backup/proposal.md` | **Tasks:** 20 | **Time:** ~80 min | **Integration Tier:** large

## Goal

Turn the dead cloud-sync path into a working, honest, fail-open **backup**: silent anonymous
session on boot, an optional email magic-link upgrade that preserves the same `uid`, single-flight
reconcile, and a truthful backup-status UI — all without deepening the RR-010 layer violation.

## Observable Truths (Acceptance Criteria)

Traced from spec SC 1–11. Each maps to task(s) in the Traceability Matrix below.

1. **SC1 — Session bootstraps.** On first load with no stored session, `getSessionSnapshot()` returns
   non-null `userId` with `isAnonymous === true` after `ensureAnonymousSession()` resolves.
2. **SC2 — Sync persists.** With an anon session, the `getUser()` early-return
   (`supabase.ts:124-125,150-151`) no longer fires in the normal path; upsert/load run against
   `user_collection`.
3. **SC3 — Survives reload.** After a full reload the same anon session resumes and reconcile runs
   with no data change. _(Wiring unit-tested; end-to-end verified at Phase 2 checkpoint against a live
   backend.)_
4. **SC4 — Recovers in-app loss.** With session intact, clearing the local collection then
   reconciling restores it from cloud. _(Verified at Phase 2 checkpoint.)_
5. **SC5 — Linking preserves identity.** "Secure my backup" with a valid email sends a magic link;
   after confirmation `isAnonymous === false`, `uid` unchanged. _(Wiring unit-tested; end-to-end
   verified at Phase 4 checkpoint.)_
6. **SC6 — Single-flight reconcile.** Two concurrent `reconcile()` triggers execute exactly one
   `doReconcile` (asserted by a spy).
7. **SC7 — Honest errors.** A backup failure surfaces a distinguishable error state carrying a
   reason, with a Retry affordance — not a blanket "Sync failed".
8. **SC8 — Truthful status UI.** `SyncStatus` reflects `backing-up → backed-up` and shows offline
   when `navigator.onLine === false`.
9. **SC9 — Fail-open.** When `ensureAnonymousSession()` fails, the app stays fully usable local-only
   and reports `backupState === 'error'`; no block/crash.
10. **SC10 — Config flipped.** `supabase/config.toml` has `enable_anonymous_sign_ins = true`.
11. **SC11 — Type & regression safety.** No new `any` in added core functions; `typecheck` passes;
    all existing tests remain green.

## File Map

```text
MODIFY supabase/config.toml                              (Task 1)   line 171 toggle
MODIFY packages/core/src/services/supabase.ts            (Tasks 2,3,4,5,15) singleton + wrappers + types
MODIFY packages/core/src/services/supabase.test.ts       (Tasks 2,3,4,5)  auth mocks + reset hook
MODIFY packages/core/src/index.ts                        (Task 6)   barrel re-export
MODIFY apps/web/package.json                             (Task 7)   RTL dev deps
MODIFY apps/web/vite.config.ts                           (Task 7)   test.setupFiles
CREATE apps/web/src/test/setup.ts                        (Task 7)   jest-dom + first UI test infra
CREATE apps/web/src/test/setup.smoke.test.tsx           (Task 7)   proves renderHook infra works
CREATE apps/web/src/hooks/useAuth.ts                     (Tasks 8,15)
CREATE apps/web/src/hooks/useAuth.test.tsx               (Tasks 8,15)
MODIFY apps/web/src/hooks/useSync.ts                     (Tasks 9,12) session-gate + typed error
CREATE apps/web/src/hooks/useSync.test.tsx               (Tasks 9,12)
MODIFY apps/web/src/services/reconcile.ts                (Task 11)  single-flight guard
CREATE apps/web/src/services/reconcile.test.ts           (Task 11)
MODIFY apps/web/src/components/SyncStatus.tsx            (Tasks 13,14) backup status + Secure my backup
CREATE apps/web/src/components/SyncStatus.test.tsx       (Tasks 13,14)
MODIFY apps/web/src/app/App.tsx                          (Tasks 10,16) wire useAuth + SyncStatus props
MODIFY docs/architecture.md                              (Task 17)
MODIFY README.md                                         (Task 18)  deploy note (or docs/ note)
MODIFY CHANGELOG.md                                      (Task 18)
CREATE docs/knowledge/decisions/0001-anonymous-cloud-backup.md (Task 19) ADR for D1
```

## Skeleton

1. **Phase 1 — Core auth foundation** (Tasks 1–6, ~28 min) — config flip, singleton+session cache,
   `ensureAnonymousSession`, `getSessionSnapshot`, `linkEmailIdentity`, barrel export. _Gates SC 1, 9,
   10, 11._
2. **Phase 2 — Bootstrap & live sync** (Tasks 7–10, ~22 min) — first web hook-test infra, `useAuth`,
   session-gate `useSync`, wire into `App`. _Gates SC 2, 3, 4._
3. **Phase 3 — Reliability** (Tasks 11–12, ~10 min) — single-flight `reconcile`, typed error
   surfacing. _Gates SC 6, 7._
4. **Phase 4 — Backup status UI + linking** (Tasks 13–16, ~18 min) — repurpose `SyncStatus`, "Secure
   my backup" flow, redirect-return handling, wire into `App`. _Gates SC 5, 8._
5. **Phase 5 — Docs & knowledge** (Tasks 17–20, ~14 min) — architecture, deploy note, CHANGELOG, ADR,
   full-suite closeout.

_Skeleton approved: pending human sign-off (see closing question)._

## Traceability Matrix

| SC | Task(s) |
| --- | --- |
| SC1 | 3, 4, 8 |
| SC2 | 9, 10 |
| SC3 | 10 + Phase 2 checkpoint |
| SC4 | 10 + Phase 2 checkpoint |
| SC5 | 5, 14, 15, 16 + Phase 4 checkpoint |
| SC6 | 11 |
| SC7 | 12 |
| SC8 | 13, 16 |
| SC9 | 3, 8 |
| SC10 | 1 |
| SC11 | 6, 20 + every task's verify step |

---

## Tasks

> TDD throughout. Every code task: write/adjust test → observe fail → implement → observe pass →
> `harness validate` → commit. Root scripts: `npm test` (core vitest then web vitest),
> `npm run typecheck` (build core then tsc web). A pre-commit hook already runs typecheck+test.

### Task 1: Flip anonymous sign-ins config

**Depends on:** none | **Files:** `supabase/config.toml` | **Category:** integration

1. In `supabase/config.toml` line 171, change `enable_anonymous_sign_ins = false` to
   `enable_anonymous_sign_ins = true`.
2. Verify: `grep -n 'enable_anonymous_sign_ins = true' supabase/config.toml` returns line 171.
3. Run: `harness validate`.
4. Commit: `feat(cloud-backup): enable anonymous sign-ins in supabase config`.

_Gates SC 10._

### Task 2: Memoized singleton client + session cache scaffolding

**Depends on:** Task 1 | **Files:** `packages/core/src/services/supabase.ts`, `packages/core/src/services/supabase.test.ts`

Rationale: `getClient()` currently constructs a fresh client on every call. Anonymous session reuse
across `signInAnonymously` → `getUser`, plus the synchronous `getSessionSnapshot`, require one
persistent client and a module-level session cache kept fresh via `onAuthStateChange`.

1. In `supabase.ts`, replace `getClient()` with a memoized singleton that still returns `null` when
   unconfigured (config check happens **before** cache use, so existing "not configured" tests keep
   passing). Add a module session cache and a test-only reset:

   ```ts
   let cachedClient: ReturnType<typeof createClient> | null = null;
   let sessionCache: { userId: string | null; isAnonymous: boolean } = { userId: null, isAnonymous: false };

   function getClient() {
     const { supabaseUrl, supabaseAnonKey } = getConfig();
     if (!supabaseUrl || !supabaseAnonKey) return null;
     if (cachedClient) return cachedClient;
     cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
       auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
     });
     cachedClient.auth.onAuthStateChange((_event, session) => {
       sessionCache = {
         userId: session?.user?.id ?? null,
         isAnonymous: session?.user?.is_anonymous ?? false,
       };
     });
     return cachedClient;
   }

   // Test-only: clears the singleton so each test starts clean.
   export function __resetSupabaseClientForTests() {
     cachedClient = null;
     sessionCache = { userId: null, isAnonymous: false };
   }
   ```

2. In `supabase.test.ts`: add `__resetSupabaseClientForTests` to imports; call it at the top of the
   top-level `beforeEach` (after `vi.clearAllMocks()`); add `onAuthStateChange: vi.fn()` to the
   `auth` object in `makeMockClient`.
3. Add a test: `it('reuses a single client instance across calls')` — call `getCachedItem` twice,
   assert `createClient` called exactly once; then `__resetSupabaseClientForTests()` and a third call
   → `createClient` called twice total.
4. Run: `npx vitest run packages/core/src/services/supabase.test.ts` — observe green (all prior tests
   still pass because config-null path short-circuits before the cache).
5. Run: `npm run typecheck` then `harness validate`.
6. Commit: `refactor(core): memoize supabase client and track session cache`.

_Enables SC 1, 2, 11._

### Task 3: `ensureAnonymousSession()` with fail-open error mapping (D6)

**Depends on:** Task 2 | **Files:** `packages/core/src/services/supabase.ts`, `packages/core/src/services/supabase.test.ts`

1. Add the `SessionResult` type and function to `supabase.ts`:

   ```ts
   export type SessionResult =
     | { ok: true; userId: string; isAnonymous: boolean }
     | { ok: false; reason: 'offline' | 'anon-disabled' | 'rate-limited' | 'unknown' };

   export async function ensureAnonymousSession(): Promise<SessionResult> {
     const supabase = getClient();
     if (!supabase) return { ok: false, reason: 'offline' };

     const { data: { session } } = await supabase.auth.getSession();
     if (session?.user) {
       sessionCache = { userId: session.user.id, isAnonymous: session.user.is_anonymous ?? false };
       return { ok: true, userId: session.user.id, isAnonymous: session.user.is_anonymous ?? false };
     }

     const { data, error } = await supabase.auth.signInAnonymously();
     if (error || !data.user) {
       const msg = (error?.message ?? '').toLowerCase();
       const status = (error as { status?: number } | null)?.status;
       const reason =
         msg.includes('disabled') ? 'anon-disabled'
         : (status === 429 || msg.includes('rate')) ? 'rate-limited'
         : msg.includes('fetch') || msg.includes('network') ? 'offline'
         : 'unknown';
       return { ok: false, reason };
     }
     sessionCache = { userId: data.user.id, isAnonymous: data.user.is_anonymous ?? true };
     return { ok: true, userId: data.user.id, isAnonymous: data.user.is_anonymous ?? true };
   }
   ```

2. In `supabase.test.ts` add `ensureAnonymousSession` to imports and extend `makeMockClient`'s `auth`
   with `getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null })` and
   `signInAnonymously: vi.fn()`. Add a `describe('ensureAnonymousSession')` covering:
   - returns `{ ok:false, reason:'offline' }` when unconfigured (no `createClient`).
   - creates anon session when none exists → `{ ok:true, isAnonymous:true, userId }`.
   - returns existing session without calling `signInAnonymously`.
   - maps `error.message='Anonymous sign-ins are disabled'` → `reason:'anon-disabled'`.
   - maps `error.status=429` → `reason:'rate-limited'`.
   - network error → `reason:'offline'`; unknown error → `reason:'unknown'`.
3. Run: `npx vitest run packages/core/src/services/supabase.test.ts` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(core): add fail-open ensureAnonymousSession wrapper`.

_Gates SC 1, 9._

### Task 4: `getSessionSnapshot()` synchronous read

**Depends on:** Task 3 | **Files:** `packages/core/src/services/supabase.ts`, `packages/core/src/services/supabase.test.ts`

1. Add to `supabase.ts` (reads the module cache; does not import the client into callers):

   ```ts
   export function getSessionSnapshot(): { userId: string | null; isAnonymous: boolean } {
     return { ...sessionCache };
   }
   ```

2. In `supabase.test.ts`, add a `describe('getSessionSnapshot')`:
   - after `__resetSupabaseClientForTests()`, returns `{ userId: null, isAnonymous: false }`.
   - after a successful `ensureAnonymousSession()` (mock signInAnonymously → user id `anon-1`,
     `is_anonymous:true`), returns `{ userId: 'anon-1', isAnonymous: true }`.
3. Run: `npx vitest run packages/core/src/services/supabase.test.ts` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(core): add getSessionSnapshot for hook layer`.

_Gates SC 1._

### Task 5: `linkEmailIdentity(email)` with typed LinkResult (D2)

**Depends on:** Task 4 | **Files:** `packages/core/src/services/supabase.ts`, `packages/core/src/services/supabase.test.ts`

1. Add to `supabase.ts`:

   ```ts
   export type LinkResult =
     | { ok: true }
     | { ok: false; reason: 'email-taken' | 'network' | 'invalid-email' };

   const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

   export async function linkEmailIdentity(email: string): Promise<LinkResult> {
     if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid-email' };
     const supabase = getClient();
     if (!supabase) return { ok: false, reason: 'network' };

     const { error } = await supabase.auth.updateUser({ email });
     if (error) {
       const msg = (error.message ?? '').toLowerCase();
       if (msg.includes('registered') || msg.includes('taken') || msg.includes('exists')) {
         return { ok: false, reason: 'email-taken' };
       }
       return { ok: false, reason: 'network' };
     }
     return { ok: true };
   }
   ```

2. In `supabase.test.ts` add `linkEmailIdentity` to imports and `updateUser: vi.fn()` to
   `makeMockClient`'s `auth`. Add `describe('linkEmailIdentity')`:
   - `'not-an-email'` → `{ ok:false, reason:'invalid-email' }` without calling `createClient`.
   - unconfigured → `{ ok:false, reason:'network' }`.
   - success → `{ ok:true }`, asserts `updateUser` called with `{ email }`.
   - error message "email already registered" → `{ ok:false, reason:'email-taken' }`.
   - other error → `{ ok:false, reason:'network' }`.
3. Run: `npx vitest run packages/core/src/services/supabase.test.ts` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(core): add linkEmailIdentity magic-link upgrade`.

_Enables SC 5._

### Task 6: Re-export wrappers + types through the core barrel (D5)

**Depends on:** Task 5 | **Files:** `packages/core/src/index.ts` | **Category:** integration

Note: `packages/core/src/index.ts` already does `export * from './services/supabase'`, so the new
functions and `SessionResult`/`LinkResult` types are re-exported automatically. This task **verifies**
the public surface (and adds an explicit assertion so a future refactor cannot silently drop it),
keeping web imports on the public entry — not a deep path — per D5 / RR-010.

1. Confirm `export * from './services/supabase';` is present in `index.ts` (it is, line 12). No change
   needed unless missing.
2. Add a barrel guard test at `packages/core/src/index.test.ts` (create if absent):

   ```ts
   import { describe, it, expect } from 'vitest';
   import * as core from './index';
   describe('core public barrel', () => {
     it('exports the cloud-backup auth wrappers', () => {
       expect(typeof core.ensureAnonymousSession).toBe('function');
       expect(typeof core.linkEmailIdentity).toBe('function');
       expect(typeof core.getSessionSnapshot).toBe('function');
     });
   });
   ```

3. Run: `npx vitest run packages/core/src/index.test.ts` — passes.
4. Run: `npm run typecheck` then `harness validate` then `harness check-deps`.
5. Commit: `feat(core): expose auth wrappers through public barrel`.

_Gates SC 11 (public API); enforces RR-010 boundary._

### `[checkpoint:human-verify]` — Phase 1 gate

Confirm before Phase 2: `npm test -w packages/core` green; `npm run typecheck` clean; config shows
`enable_anonymous_sign_ins = true`; no new `any` in the added functions. This closes SC 1, 9, 10 (unit
level) and 11.

### Task 7: Establish first web hook/component test infra (RTL)

**Depends on:** Task 6 | **Files:** `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/src/test/setup.ts` (+ `apps/web/src/test/setup.smoke.test.tsx`) | **Category:** integration

`[checkpoint:human-action]` — The install touches the lockfile and React-18 `@types/react` peers
(recent CI fix f3cbdb4 concerned npm auto-installing a React-19 peer). Run the install intentionally
and confirm the root lockfile stays on React 18.

1. Install dev deps for the web workspace:
   `npm install -D -w apps/web @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6`.
2. Create `apps/web/src/test/setup.ts`:

   ```ts
   import '@testing-library/jest-dom/vitest';
   ```

3. In `apps/web/vite.config.ts`, add `setupFiles: ['./src/test/setup.ts']` inside the `test` block
   (alongside `environment: 'jsdom', globals: true`).
4. Create smoke test `apps/web/src/test/setup.smoke.test.tsx` proving `renderHook` + jest-dom matchers
   work:

   ```tsx
   import { describe, it, expect } from 'vitest';
   import { renderHook } from '@testing-library/react';
   import { useState } from 'react';

   describe('web test infra', () => {
     it('renders a hook and exposes jest-dom matchers', () => {
       const { result } = renderHook(() => useState(42));
       expect(result.current[0]).toBe(42);
       document.body.innerHTML = '<button>ok</button>';
       expect(document.querySelector('button')).toBeInTheDocument();
     });
   });
   ```

5. Run: `npm test -w apps/web` — smoke test passes; existing service tests still green.
6. Run: `npm run typecheck` then `harness validate`.
7. Commit: `test(web): establish RTL hook/component test setup`.

_Infra for SC 1(web), 5, 7, 8._

### Task 8: `useAuth` hook — boot effect + backup state

**Depends on:** Task 7 | **Files:** `apps/web/src/hooks/useAuth.ts`, `apps/web/src/hooks/useAuth.test.tsx`

1. Create `apps/web/src/hooks/useAuth.ts`:

   ```ts
   import { useEffect, useRef, useState } from 'react';
   import { ensureAnonymousSession, getSessionSnapshot, linkEmailIdentity } from '@anti-kragle/core';
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

     useEffect(() => {
       if (started.current) return;
       started.current = true;
       (async () => {
         const result = await ensureAnonymousSession();
         setSnapshot(getSessionSnapshot());
         setSessionReady(true);
         setBackupState(result.ok ? 'backed-up' : 'error'); // fail-open (D6/SC9)
       })();
     }, []);

     return {
       userId: snapshot.userId,
       isAnonymous: snapshot.isAnonymous,
       sessionReady,
       backupState,
       linkEmail: linkEmailIdentity,
     };
   }
   ```

2. Create `apps/web/src/hooks/useAuth.test.tsx` (mock the core barrel):

   ```tsx
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { renderHook, waitFor } from '@testing-library/react';
   vi.mock('@anti-kragle/core', () => ({
     ensureAnonymousSession: vi.fn(),
     getSessionSnapshot: vi.fn(),
     linkEmailIdentity: vi.fn(),
   }));
   import { ensureAnonymousSession, getSessionSnapshot } from '@anti-kragle/core';
   import { useAuth } from './useAuth';

   beforeEach(() => vi.clearAllMocks());

   it('bootstraps an anon session and reports backed-up', async () => {
     (getSessionSnapshot as any).mockReturnValueOnce({ userId: null, isAnonymous: false })
       .mockReturnValue({ userId: 'anon-1', isAnonymous: true });
     (ensureAnonymousSession as any).mockResolvedValue({ ok: true, userId: 'anon-1', isAnonymous: true });
     const { result } = renderHook(() => useAuth());
     await waitFor(() => expect(result.current.sessionReady).toBe(true));
     expect(result.current.userId).toBe('anon-1');
     expect(result.current.isAnonymous).toBe(true);
     expect(result.current.backupState).toBe('backed-up');
   });

   it('fails open to error state without crashing (SC9)', async () => {
     (getSessionSnapshot as any).mockReturnValue({ userId: null, isAnonymous: false });
     (ensureAnonymousSession as any).mockResolvedValue({ ok: false, reason: 'anon-disabled' });
     const { result } = renderHook(() => useAuth());
     await waitFor(() => expect(result.current.sessionReady).toBe(true));
     expect(result.current.backupState).toBe('error');
   });
   ```

3. Run: `npx vitest run apps/web/src/hooks/useAuth.test.tsx` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(web): add useAuth bootstrap hook`.

_Gates SC 1 (web), SC 9._

### Task 9: Session-gate `useSync` first run

**Depends on:** Task 8 | **Files:** `apps/web/src/hooks/useSync.ts`, `apps/web/src/hooks/useSync.test.tsx`

1. Change `useSync` to accept `sessionReady: boolean` and defer the first `runSync` + interval until
   `sessionReady === true` (deterministic boot order per spec Phase 2). Signature:
   `export function useSync(sessionReady: boolean): { status: SyncStatus; triggerSync: () => void }`.
   Guard the mount effect with `if (!sessionReady) return;` (keep the offline branch), and add
   `sessionReady` to the effect deps.
2. Create `apps/web/src/hooks/useSync.test.tsx` (mock `../services/reconcile`):
   - with `sessionReady=false`, `reconcile` is **not** called after mount.
   - re-render with `sessionReady=true` → `reconcile` called once.
   - offline (`navigator.onLine=false`) with `sessionReady=true` → status `offline`, no reconcile.
3. Run: `npx vitest run apps/web/src/hooks/useSync.test.tsx` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(web): gate first sync on session readiness`.

_Gates SC 2 (ordering). Note: signature change is consumed in Task 10._

### Task 10: Wire `useAuth` into App bootstrap

**Depends on:** Task 9 | **Files:** `apps/web/src/app/App.tsx` | **Category:** integration

1. In `App.tsx`, import and call `useAuth`; pass `sessionReady` into `useSync`:

   ```ts
   const { sessionReady, backupState, isAnonymous, linkEmail } = useAuth();
   const { status: syncStatus, triggerSync } = useSync(sessionReady);
   ```

   Retain `backupState`, `isAnonymous`, `linkEmail` for the Phase 4 `SyncStatus` wiring (Task 16).
2. Verify no unused-var/type errors: `npm run typecheck`.
3. Run: `npm test` (full suite) — all green.
4. Run: `harness validate`.
5. Commit: `feat(web): bootstrap anonymous session in App`.

_Gates SC 2; enables SC 3/4 (verified at checkpoint)._

### `[checkpoint:human-verify]` — Phase 2 gate (live backend)

Manual smoke against a configured Supabase project (anon sign-ins enabled). Verify: first load creates
an anon session (SC 1); adding an item writes a `user_collection` row scoped to `auth.uid()`, the
early-return no longer fires (SC 2); a full reload resumes the same session and reconciles unchanged
(SC 3); clearing local collection then reconciling restores from cloud (SC 4). If the backend is
unreachable, confirm the app stays usable local-only (SC 9).

### Task 11: Single-flight guard on `reconcile()` (D3)

**Depends on:** Task 10 | **Files:** `apps/web/src/services/reconcile.ts`, `apps/web/src/services/reconcile.test.ts`

1. Refactor `reconcile.ts` to extract the body into `doReconcile()` and wrap with a module-level
   in-flight promise:

   ```ts
   let inFlight: Promise<void> | null = null;

   export function reconcile(): Promise<void> {
     if (inFlight) return inFlight;
     inFlight = doReconcile().finally(() => { inFlight = null; });
     return inFlight;
   }

   async function doReconcile(): Promise<void> {
     const cloudResult = await loadCollectionFromCloud();
     if (!cloudResult) return;
     const local = loadCollection();
     const merged = reconcileCollection(local, cloudResult.items, cloudResult.tombstoneIds);
     saveCollection(merged);
     const queue = loadSyncQueue();
     await syncCollectionToCloud(queue);
     clearSyncQueue();
   }
   ```

2. Create `apps/web/src/services/reconcile.test.ts` (mock `@anti-kragle/core`, `./storage`,
   `./syncQueue`): make `loadCollectionFromCloud` return a promise resolved on a controllable
   deferred; call `reconcile()` twice concurrently; assert `loadCollectionFromCloud` (the
   `doReconcile` entry) invoked **exactly once** and both callers resolve. Add a follow-up test: a
   fresh `reconcile()` after the first settles invokes it again (guard resets).
3. Run: `npx vitest run apps/web/src/services/reconcile.test.ts` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `fix(web): single-flight guard on reconcile`.

_Gates SC 6._

### Task 12: Typed error surfacing through `useSync` (D3)

**Depends on:** Task 11 | **Files:** `apps/web/src/hooks/useSync.ts`, `apps/web/src/hooks/useSync.test.tsx`

Decision (within web layer, avoids churning core's `SyncStatus` union): carry the reason as a separate
hook field rather than widening the core enum.

1. Extend `useSync` to return `errorReason: string | null`. In the `catch`, derive a distinguishable
   reason from the thrown error (e.g. `err instanceof Error ? err.message : 'unknown'`) and set both
   `status='error'` and `errorReason`; clear `errorReason` to `null` on success. Return
   `{ status, errorReason, triggerSync }`.
2. Extend `useSync.test.tsx`:
   - when `reconcile` rejects with `new Error('rate-limited')`, `status==='error'` and
     `errorReason==='rate-limited'` (not a blanket message).
   - a subsequent successful run clears `errorReason` to `null`.
3. Run: `npx vitest run apps/web/src/hooks/useSync.test.tsx` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(web): surface typed sync error reason`.

_Gates SC 7._

### `[checkpoint:human-verify]` — Phase 3 gate

Confirm `npm test -w apps/web` green: single-flight test shows one underlying run (SC 6); error test
shows a distinguishable reason (SC 7).

### Task 13: Repurpose `SyncStatus` as backup status (SC 8)

**Depends on:** Task 12 | **Files:** `apps/web/src/components/SyncStatus.tsx`, `apps/web/src/components/SyncStatus.test.tsx`

1. Change `SyncStatus` props to backup semantics (filename unchanged per spec):

   ```ts
   interface Props {
     backupState: 'initializing' | 'backed-up' | 'backing-up' | 'offline' | 'error';
     errorReason?: string | null;
     isAnonymous: boolean;
     onRetry: () => void;
     onSecure: (email: string) => Promise<{ ok: boolean; reason?: string }>;
   }
   ```

   Render, keeping existing `data-testid`s where sensible:
   - `initializing` → render `null`.
   - `backing-up` → spinner + "Backing up…" (`data-testid="backup-status-backingup"`).
   - `backed-up` → check + "Backed up" (`data-testid="backup-status-done"`).
   - `offline` → "Offline — will back up when online" (`data-testid="backup-status-offline"`).
   - `error` → `CloudOff` + "Backup failed" plus the `errorReason` when present + Retry button
     (`data-testid="backup-status-retry"`).
   (Leave the "Secure my backup" affordance to Task 14.)
2. Create `apps/web/src/components/SyncStatus.test.tsx` (RTL `render` + `screen`): assert each state
   renders the right testid/text; `backed-up` shows "Backed up"; `error` with
   `errorReason='rate-limited'` shows the reason and Retry calls `onRetry`.
3. Run: `npx vitest run apps/web/src/components/SyncStatus.test.tsx` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(web): repurpose SyncStatus as backup status`.

_Gates SC 8._

### Task 14: "Secure my backup" magic-link flow (SC 5)

**Depends on:** Task 13 | **Files:** `apps/web/src/components/SyncStatus.tsx`, `apps/web/src/components/SyncStatus.test.tsx`

1. In `SyncStatus.tsx`, add a low-key inline "Secure my backup" affordance shown **only when
   `isAnonymous`** (non-nagging, not a modal): a button that reveals a small email input + submit
   calling `onSecure(email)`; on `{ ok:true }` show "Check your email to finish securing your backup";
   on `{ ok:false }` show a reason-specific message (`invalid-email`/`email-taken`/`network`).
2. Extend `SyncStatus.test.tsx`:
   - affordance hidden when `isAnonymous=false`; shown when `true`.
   - entering a valid email + submit calls `onSecure` with it; success renders the confirmation text.
   - `onSecure` returning `{ ok:false, reason:'email-taken' }` renders the taken message.
3. Run: `npx vitest run apps/web/src/components/SyncStatus.test.tsx` — fail then pass.
4. Run: `npm run typecheck` then `harness validate`.
5. Commit: `feat(web): add Secure my backup email-link affordance`.

_Enables SC 5._

### Task 15: Account-link return handling in `useAuth` (S4-002)

**Depends on:** Task 14 | **Files:** `apps/web/src/hooks/useAuth.ts`, `apps/web/src/hooks/useAuth.test.tsx`, `packages/core/src/services/supabase.ts`

1. `detectSessionInUrl: true` is already set on the client (Task 2), so returning from the magic link
   completes the session. Add a core helper so the hook can subscribe without importing the client:
   in `supabase.ts` add
   `export function onSessionChange(cb: (s: { userId: string|null; isAnonymous: boolean }) => void): () => void`
   that registers via `getClient()?.auth.onAuthStateChange` (updating `sessionCache`) and returns an
   unsubscribe; export through the barrel (auto via `export *`).
2. In `useAuth.ts`, subscribe with `onSessionChange` in the boot effect and `setSnapshot` on each
   change, so after link confirmation `isAnonymous` flips to `false`. Clean up on unmount.
3. Extend `useAuth.test.tsx`: mock `onSessionChange` to invoke its callback with
   `{ userId:'anon-1', isAnonymous:false }`; assert `result.current.isAnonymous === false` and
   `userId` unchanged (`'anon-1'`) — identity preserved (SC 5).
4. Run: `npx vitest run apps/web/src/hooks/useAuth.test.tsx packages/core/src/services/supabase.test.ts`
   — fail then pass (add a core test for `onSessionChange` registering + unsubscribe).
5. Run: `npm run typecheck` then `harness validate`.
6. Commit: `feat(web): reflect account-link return in useAuth`.

_Enables SC 5._

### Task 16: Wire backup status + linking into App

**Depends on:** Task 15 | **Files:** `apps/web/src/app/App.tsx` | **Category:** integration

1. In `App.tsx`, replace the current `<SyncStatus status={syncStatus} onRetry={triggerSync} />` with
   backup props derived from `useAuth` + `useSync`: map `syncStatus`/`errorReason`/`backupState` into
   the component's `backupState`+`errorReason`, and pass `isAnonymous`, `onRetry={triggerSync}`,
   `onSecure={linkEmail}`. (Derive a single `backupState`: `syncing→backing-up`, `error→error`,
   `offline→offline`, otherwise `backupState` from `useAuth`.)
2. Run: `npm run typecheck` (no unused vars from Task 10) then `npm test` (full suite green).
3. Run: `harness validate`.
4. Commit: `feat(web): wire backup status and linking into App`.

_Gates SC 5, SC 8 (end-to-end wiring)._

### `[checkpoint:human-verify]` — Phase 4 gate (live backend + email)

Manual: with an anon session, "Secure my backup" + a valid email sends a magic link; after
confirmation `isAnonymous === false`, `uid` unchanged, prior rows still owned (SC 5). Confirm the
status UI transitions `backing-up → backed-up` and shows offline when `navigator.onLine === false`
(SC 8).

### Task 17: Update `docs/architecture.md`

**Depends on:** Task 16 | **Files:** `docs/architecture.md` | **Category:** integration

1. Add a section documenting: auth/session responsibility now lives in core's `services/supabase.ts`
   (`ensureAnonymousSession`, `linkEmailIdentity`, `getSessionSnapshot`, `onSessionChange`); the
   anonymous-backup + account-linking (uid-preserving) model; that web consumes only via `useAuth`
   (not deep imports) — recording decision **D5** and reinforcing the RR-010 boundary. Note the
   memoized singleton client + session cache.
2. Run: `npm run lint:md` then `harness validate`.
3. Commit: `docs(architecture): record auth-in-core and anon-backup model (D5)`.

### Task 18: Deploy note + CHANGELOG

**Depends on:** Task 17 | **Files:** `README.md`, `CHANGELOG.md` | **Category:** integration

1. In `README.md` add a setup/deploy note: enable `enable_anonymous_sign_ins` on the **hosted**
   Supabase project (mirrors the local `config.toml` toggle) and configure the auth **redirect URL**
   the app handles on magic-link return.
2. In `CHANGELOG.md` add an entry for anonymous cloud backup + optional account-linking + single-flight
   reconcile + honest backup status.
3. Run: `npm run lint:md` then `harness validate`.
4. Commit: `docs: add cloud-backup deploy note and changelog`.

### Task 19: ADR for D1 + knowledge concepts

**Depends on:** Task 18 | **Files:** `docs/knowledge/decisions/0001-anonymous-cloud-backup.md` | **Category:** integration

1. Write an ADR capturing **D1** (anonymous backup over full auth; defers multi-device) with context,
   decision, consequences, and pointers to the spec's Decisions Made. Note the knowledge-graph
   concepts from the spec: _anonymous-session backup_, _account-linking (uid preservation)_,
   _single-flight reconcile_, _fail-open backup_, and relationships (`SyncStatus` reflects
   `reconcile` guarded-by single-flight; `linkEmailIdentity` upgrades anonymous session).
2. Run: `npm run lint:md` then `harness validate`.
3. Commit: `docs(adr): 0001 anonymous cloud backup over full auth (D1)`.

### Task 20: Full-suite regression closeout (SC 11)

**Depends on:** Task 19 | **Files:** none (verification only)

1. Run: `npm run typecheck` — clean.
2. Run: `npm test` — all core + web tests green (no `any` introduced in core wrappers; existing tests
   unchanged).
3. Run: `npm run lint:md`, then `harness validate` and `harness check-deps`.
4. Re-read the SC list; confirm each unit-verifiable criterion (SC 1, 2, 6, 7, 8, 9, 10, 11) is green
   and the live-backend criteria (SC 3, 4, 5) were signed off at their checkpoints.
5. Commit (if any incidental fixes): `chore(cloud-backup): regression closeout`.

_Gates SC 11._

## Change Specification (delta vs. current behavior)

- **[ADDED]** `ensureAnonymousSession`, `linkEmailIdentity`, `getSessionSnapshot`, `onSessionChange`
  in core + barrel exports; `useAuth` hook; `reconcile` single-flight guard; RTL web test infra.
- **[MODIFIED]** `getClient()` → memoized singleton with session cache; `useSync` gated on session
  readiness and carries a typed error reason; `SyncStatus` reports backup status + "Secure my backup"
  (filename unchanged); `App` wires `useAuth`; `supabase/config.toml` toggle.
- **[REMOVED]** The misleading blanket "Sync failed" surfacing (replaced by reason-carrying error);
  the silent no-op default of `loadCollectionFromCloud`/`syncCollectionToCloud` (guard becomes a
  genuine safety net, signatures unchanged).

## Assumptions

- **[ASSUMPTION] Singleton refactor is required and in-scope.** Session reuse + synchronous
  `getSessionSnapshot` need one persistent client + module cache. Existing `supabase.test.ts` must
  call `__resetSupabaseClientForTests()` in `beforeEach` (Task 2). No public signature changes.
- **[ASSUMPTION] `getSessionSnapshot` is synchronous** (per spec) and returns `{null,false}` until
  `ensureAnonymousSession` resolves; kept fresh by `onAuthStateChange`.
- **[ASSUMPTION] Error-reason carried as a web-layer field**, not by widening core's `SyncStatus`
  union — avoids churn in shared types and the future iOS contract.
- **[ASSUMPTION] RTL is not installed** (confirmed); Task 7 adds `@testing-library/react@16` (React
  18-compatible), `/dom@10`, `/jest-dom@6`. Marked `human-action` due to lockfile/`@types/react`
  peer sensitivity (recent CI fix f3cbdb4).
- **[ASSUMPTION] `is_anonymous`** is present on the Supabase user object (supabase-js ≥ 2.105.1) and
  `detectSessionInUrl` defaults on; set explicitly in Task 2.
- **[DEFERRABLE] Exact error-message substrings** for `anon-disabled`/`email-taken` mapping may need
  tuning against real Supabase responses; finalize during implementation/Task 3/5.

## Risks

- **R1 — RR-010 regression.** Web must import wrappers only via the core barrel + `useAuth`. Enforced
  by Task 6's barrel guard test and Tasks 8/15 mocking `@anti-kragle/core`. Do **not** deepen
  `catalog.ts`'s existing violation.
- **R2 — Singleton leaks across core tests.** Mitigated by `__resetSupabaseClientForTests()` in
  `beforeEach` and config-null short-circuit before cache use (Task 2).
- **R3 — Live-backend criteria (SC 3, 4, 5)** are not fully unit-testable; covered by Phase 2 & 4
  human-verify checkpoints. If no test project is available, flag before Phase 4.
- **R4 — RTL install** could pull a React-19 `@types/react` peer (prior CI failure). Pinned versions +
  `human-action` checkpoint mitigate.

## Notes

- Skill advisor (`SKILLS.md`) surfaced no keyword/skill matches — no skill annotations applied.
- Each task ends with `harness validate`; the repo's pre-commit hook additionally runs typecheck+test
  (MEMORY: always gate on `harness:verify`/tests before commit).
