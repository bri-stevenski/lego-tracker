import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anti-kragle/core', () => ({
  loadCollectionFromCloud: vi.fn(),
  reconcileCollection: vi.fn((_local, items) => items),
  syncCollectionToCloud: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./storage', () => ({
  loadCollection: vi.fn(() => []),
  saveCollection: vi.fn(),
}));

import { loadCollectionFromCloud, syncCollectionToCloud } from '@anti-kragle/core';
import type { OwnedLegoItem, SyncQueueEntry } from '@anti-kragle/core';
import { reconcile } from './reconcile';
import { enqueueMutation, loadSyncQueue, saveSyncQueue } from './syncQueue';

const mockLoadFromCloud = vi.mocked(loadCollectionFromCloud);
const mockSyncToCloud = vi.mocked(syncCollectionToCloud);

function makeOwnedItem(id: string, updatedAt = '2024-01-01T00:00:00.000Z'): OwnedLegoItem {
  return {
    id, type: 'set', number: '10305', name: 'Test', theme: 'Icons',
    year: 2022, pieceCount: 100, retired: false, estimatedValue: 99,
    imageUrl: '', status: 'collection', acquiredQuality: 'new',
    savedBox: true, buildStatus: 'not-started', displayLocation: '',
    notes: '', missingParts: '', quantity: 1,
    addedAt: '2024-01-01T00:00:00.000Z', updatedAt,
  };
}

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockSyncToCloud.mockResolvedValue(undefined);
});

describe('reconcile single-flight guard', () => {
  it('runs the underlying reconcile exactly once for concurrent triggers (SC6)', async () => {
    const d = deferred<{ items: []; tombstoneIds: [] }>();
    mockLoadFromCloud.mockReturnValueOnce(d.promise);

    // Two concurrent triggers (interval + online + manual can overlap).
    const first = reconcile();
    const second = reconcile();

    // Both callers share the same in-flight promise.
    expect(first).toBe(second);
    expect(mockLoadFromCloud).toHaveBeenCalledTimes(1);

    d.resolve({ items: [], tombstoneIds: [] });
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();

    // Still exactly one underlying run across both concurrent callers.
    expect(mockLoadFromCloud).toHaveBeenCalledTimes(1);
  });

  it('resets the guard so a later reconcile runs again', async () => {
    mockLoadFromCloud.mockResolvedValue({ items: [], tombstoneIds: [] } as never);

    await reconcile();
    expect(mockLoadFromCloud).toHaveBeenCalledTimes(1);

    await reconcile();
    expect(mockLoadFromCloud).toHaveBeenCalledTimes(2);
  });
});

describe('reconcile preserves during-sync mutations (S1)', () => {
  it('keeps a mutation enqueued during in-flight sync while removing the synced snapshot', async () => {
    // Original entry that gets sent to the cloud.
    saveSyncQueue([{ type: 'upsert', item: makeOwnedItem('a', '2024-01-01T00:00:00.000Z') }]);
    mockLoadFromCloud.mockResolvedValue({ items: [], tombstoneIds: [] } as never);

    // Simulate a mutation for the SAME item enqueued during the multi-second await.
    mockSyncToCloud.mockImplementation(async () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a', '2024-02-02T00:00:00.000Z') });
    });

    await reconcile();

    const queue = loadSyncQueue();
    // The during-sync mutation must survive; the synced snapshot must be gone.
    expect(queue).toHaveLength(1);
    expect((queue[0] as Extract<SyncQueueEntry, { type: 'upsert' }>).item.updatedAt)
      .toBe('2024-02-02T00:00:00.000Z');
  });

  it('removes all synced entries when nothing new is enqueued', async () => {
    saveSyncQueue([
      { type: 'upsert', item: makeOwnedItem('a') },
      { type: 'delete', itemId: 'b', deletedAt: '2024-01-03T00:00:00.000Z' },
    ]);
    mockLoadFromCloud.mockResolvedValue({ items: [], tombstoneIds: [] } as never);

    await reconcile();

    expect(loadSyncQueue()).toHaveLength(0);
  });
});
