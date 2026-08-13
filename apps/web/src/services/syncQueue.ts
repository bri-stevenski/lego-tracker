import type { SyncQueueEntry } from '@anti-kragle/core';

export const QUEUE_KEY = 'brick-ledger.sync-queue.v1';

function getItemId(entry: SyncQueueEntry): string {
  return entry.type === 'upsert' ? entry.item.id : entry.itemId;
}

export function loadSyncQueue(): SyncQueueEntry[] {
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSyncQueue(entries: SyncQueueEntry[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
}

export function enqueueMutation(entry: SyncQueueEntry): void {
  const queue = loadSyncQueue();
  const id = getItemId(entry);
  const filtered = queue.filter(e => getItemId(e) !== id);
  saveSyncQueue([...filtered, entry]);
}

export function clearSyncQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Content key identifies a specific mutation snapshot, not just an item id.
// A mutation made for the same item DURING a sync produces a different timestamp
// and therefore a different content key, so it survives removeSyncedEntries.
function contentKey(entry: SyncQueueEntry): string {
  return entry.type === 'upsert'
    ? `${entry.item.id}|${entry.item.updatedAt}`
    : `${entry.itemId}|${entry.deletedAt}`;
}

// Remove only the entries that were actually synced (matched by content key),
// re-reading the CURRENT queue so mutations enqueued during the in-flight sync
// are preserved rather than wiped by a blanket clear.
export function removeSyncedEntries(synced: SyncQueueEntry[]): void {
  const syncedKeys = new Set(synced.map(contentKey));
  const current = loadSyncQueue();
  saveSyncQueue(current.filter(e => !syncedKeys.has(contentKey(e))));
}
