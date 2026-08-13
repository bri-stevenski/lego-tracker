import { describe, it, expect, beforeEach } from 'vitest';
import { loadSyncQueue, saveSyncQueue, enqueueMutation, clearSyncQueue, removeSyncedEntries } from './syncQueue';
import type { SyncQueueEntry, OwnedLegoItem } from '@anti-kragle/core';

const QUEUE_KEY = 'brick-ledger.sync-queue.v1';

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

describe('syncQueue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadSyncQueue', () => {
    it('returns empty array when key is absent', () => {
      expect(loadSyncQueue()).toEqual([]);
    });

    it('returns parsed entries when key exists', () => {
      const entries: SyncQueueEntry[] = [{ type: 'upsert', item: makeOwnedItem('a') }];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
      expect(loadSyncQueue()).toHaveLength(1);
      expect(loadSyncQueue()[0].type).toBe('upsert');
    });
  });

  describe('saveSyncQueue', () => {
    it('persists entries to localStorage', () => {
      const entries: SyncQueueEntry[] = [{ type: 'delete', itemId: 'a', deletedAt: '2024-01-02T00:00:00.000Z' }];
      saveSyncQueue(entries);
      expect(JSON.parse(localStorage.getItem(QUEUE_KEY)!)).toHaveLength(1);
    });
  });

  describe('enqueueMutation', () => {
    it('appends a new entry', () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a') });
      expect(loadSyncQueue()).toHaveLength(1);
    });

    it('replaces existing entry with same itemId for upsert (deduplication)', () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a', '2024-01-01T00:00:00.000Z') });
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a', '2024-01-02T00:00:00.000Z') });
      const queue = loadSyncQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0] as Extract<SyncQueueEntry, { type: 'upsert' }>).item.updatedAt)
        .toBe('2024-01-02T00:00:00.000Z');
    });

    it('replaces existing upsert with a delete for the same itemId', () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a') });
      enqueueMutation({ type: 'delete', itemId: 'a', deletedAt: '2024-01-02T00:00:00.000Z' });
      const queue = loadSyncQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].type).toBe('delete');
    });

    it('keeps entries for different itemIds', () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a') });
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('b') });
      expect(loadSyncQueue()).toHaveLength(2);
    });
  });

  describe('clearSyncQueue', () => {
    it('empties the queue', () => {
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a') });
      clearSyncQueue();
      expect(loadSyncQueue()).toHaveLength(0);
    });
  });

  describe('removeSyncedEntries', () => {
    it('removes only the entries matching a synced content key', () => {
      const synced: SyncQueueEntry[] = [
        { type: 'upsert', item: makeOwnedItem('a', '2024-01-01T00:00:00.000Z') },
        { type: 'delete', itemId: 'b', deletedAt: '2024-01-03T00:00:00.000Z' },
      ];
      saveSyncQueue([...synced, { type: 'upsert', item: makeOwnedItem('c') }]);

      removeSyncedEntries(synced);

      const queue = loadSyncQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0] as Extract<SyncQueueEntry, { type: 'upsert' }>).item.id).toBe('c');
    });

    it('preserves a same-id upsert enqueued after the snapshot (different updatedAt)', () => {
      const synced: SyncQueueEntry[] = [
        { type: 'upsert', item: makeOwnedItem('a', '2024-01-01T00:00:00.000Z') },
      ];
      // enqueueMutation dedups by id, so storage now holds only the newer entry.
      saveSyncQueue(synced);
      enqueueMutation({ type: 'upsert', item: makeOwnedItem('a', '2024-02-02T00:00:00.000Z') });

      removeSyncedEntries(synced);

      const queue = loadSyncQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0] as Extract<SyncQueueEntry, { type: 'upsert' }>).item.updatedAt)
        .toBe('2024-02-02T00:00:00.000Z');
    });

    it('preserves a same-id delete enqueued after the snapshot (different deletedAt)', () => {
      const synced: SyncQueueEntry[] = [
        { type: 'delete', itemId: 'a', deletedAt: '2024-01-01T00:00:00.000Z' },
      ];
      saveSyncQueue(synced);
      enqueueMutation({ type: 'delete', itemId: 'a', deletedAt: '2024-02-02T00:00:00.000Z' });

      removeSyncedEntries(synced);

      const queue = loadSyncQueue();
      expect(queue).toHaveLength(1);
      expect((queue[0] as Extract<SyncQueueEntry, { type: 'delete' }>).deletedAt)
        .toBe('2024-02-02T00:00:00.000Z');
    });
  });
});
