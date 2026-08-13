import { loadCollectionFromCloud, reconcileCollection, syncCollectionToCloud } from '@anti-kragle/core';
import { loadCollection, saveCollection } from './storage';
import { loadSyncQueue, removeSyncedEntries } from './syncQueue';

let inFlight: Promise<void> | null = null;

// Single-flight guard: concurrent triggers (interval + online + manual) await the
// same run instead of interleaving load/save on the shared localStorage collection.
export function reconcile(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doReconcile().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// Test-only: drops the single-flight guard so each test starts clean. Mirrors
// `__resetSupabaseClientForTests` in core.
//
// Without this, `inFlight` is module state with no reset path. It happens to be
// clean today only because every existing test resolves its deferred. The first
// test that leaves one unresolved — a timeout or abort case, the obvious next
// test to write — hands the stale promise to every subsequent test in the file,
// which then asserts against a run that never happened.
export function __resetReconcileForTests(): void {
  inFlight = null;
}

async function doReconcile(): Promise<void> {
  const cloudResult = await loadCollectionFromCloud();
  if (!cloudResult) return; // not configured or unauthenticated — no-op

  const local = loadCollection();
  const merged = reconcileCollection(local, cloudResult.items, cloudResult.tombstoneIds);
  saveCollection(merged);

  const queue = loadSyncQueue();
  await syncCollectionToCloud(queue); // throws on network error — caller handles
  // Remove only the snapshot we actually sent; a mutation enqueued during the
  // await above has a different content key and is preserved for the next run.
  removeSyncedEntries(queue);
}
