# Multi-Device State Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pull-merge-push reconciliation to the existing Supabase sync so collection edits, additions, and deletions propagate across all devices within 5 minutes.

**Architecture:** A pure `reconcileCollection` function in `packages/core` handles LWW merging and tombstone application. A `syncQueue` in `localStorage` buffers mutations made while offline. A `useSync` hook in `apps/web` triggers reconciliation on load, every 5 minutes, and on reconnect; a `SyncStatus` component surfaces sync state to the user.

**Tech Stack:** TypeScript, React, Supabase JS v2, Vitest, jsdom, localStorage

**Spec:** `docs/changes/multi-device-sync/proposal.md`

---

## File Map

```text
CREATE  supabase/migrations/20260601000000_sync_columns.sql
MODIFY  packages/core/src/types/lego.ts                    — add SyncQueueEntry, SyncStatus
CREATE  packages/core/src/domain/sync.ts                   — reconcileCollection (pure)
CREATE  packages/core/src/domain/sync.test.ts
MODIFY  packages/core/src/services/supabase.ts             — add loadCollectionFromCloud, update syncCollectionToCloud
MODIFY  packages/core/src/services/supabase.test.ts        — extend mock + new tests
MODIFY  packages/core/src/index.ts                         — re-export new symbols
CREATE  apps/web/src/services/syncQueue.ts                 — localStorage queue
CREATE  apps/web/src/services/syncQueue.test.ts
CREATE  apps/web/src/services/reconcile.ts                 — orchestration (pull→merge→push)
CREATE  apps/web/src/hooks/useSync.ts                      — interval + online/offline events
CREATE  apps/web/src/components/SyncStatus.tsx             — status indicator
MODIFY  apps/web/src/app/App.tsx                           — wire hook, component, enqueueMutation
```

---

## Task 1: Database migration

**Files:**

- Create: `supabase/migrations/20260601000000_sync_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add added_at to persist OwnedLegoItem.addedAt (previously lost on sync)
-- Add deleted_at as a tombstone: NULL = live, non-null = deleted on some device
ALTER TABLE public.user_collection
  ADD COLUMN added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN deleted_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply locally (if Supabase CLI is available)**

```bash
npx supabase db push
```

If you don't have a local Supabase instance, run the SQL manually in the Supabase dashboard SQL editor. The app code handles missing columns gracefully — columns default to `NOW()` / `NULL` for existing rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260601000000_sync_columns.sql
git commit -m "feat(db): add added_at and deleted_at columns to user_collection"
```

---

## Task 2: Add `SyncQueueEntry` and `SyncStatus` types

**Files:**

- Modify: `packages/core/src/types/lego.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add types to `packages/core/src/types/lego.ts`**

Append after the `CollectionSummary` interface:

```typescript
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export type SyncQueueEntry =
  | { type: 'upsert'; item: OwnedLegoItem }
  | { type: 'delete'; itemId: string; deletedAt: string };
```

- [ ] **Step 2: Verify `packages/core/src/index.ts` exports `./types/lego`**

It already has `export * from './types/lego';` — no change needed.

- [ ] **Step 3: Build check**

```bash
cd packages/core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types/lego.ts
git commit -m "feat(types): add SyncQueueEntry and SyncStatus"
```

---

## Task 3: Implement `reconcileCollection` (TDD)

**Files:**

- Create: `packages/core/src/domain/sync.test.ts`
- Create: `packages/core/src/domain/sync.ts`

`★ Insight:` Tombstones are applied before the LWW merge. Without this ordering, a locally-newer edit to an item that was deleted on another device would resurrect it.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/domain/sync.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reconcileCollection } from './sync';
import type { OwnedLegoItem } from '../types/lego';

function makeItem(id: string, updatedAt: string, overrides: Partial<OwnedLegoItem> = {}): OwnedLegoItem {
  return {
    id,
    type: 'set',
    number: '10305',
    name: 'Test Set',
    theme: 'Icons',
    year: 2022,
    pieceCount: 100,
    retired: false,
    estimatedValue: 99.99,
    imageUrl: 'http://example.com/img.jpg',
    status: 'collection',
    acquiredQuality: 'new',
    savedBox: true,
    buildStatus: 'not-started',
    displayLocation: '',
    notes: '',
    missingParts: '',
    quantity: 1,
    addedAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    ...overrides,
  };
}

describe('reconcileCollection', () => {
  it('uses remote item when remote updatedAt is newer', () => {
    const local = [makeItem('a', '2024-01-01T00:00:00.000Z', { notes: 'local' })];
    const remote = [makeItem('a', '2024-01-02T00:00:00.000Z', { notes: 'remote' })];
    const result = reconcileCollection(local, remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].notes).toBe('remote');
  });

  it('keeps local item when local updatedAt is strictly newer', () => {
    const local = [makeItem('a', '2024-01-03T00:00:00.000Z', { notes: 'local' })];
    const remote = [makeItem('a', '2024-01-02T00:00:00.000Z', { notes: 'remote' })];
    const result = reconcileCollection(local, remote, []);
    expect(result[0].notes).toBe('local');
  });

  it('remote wins on equal updatedAt (tie-break)', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const local = [makeItem('a', ts, { notes: 'local' })];
    const remote = [makeItem('a', ts, { notes: 'remote' })];
    const result = reconcileCollection(local, remote, []);
    expect(result[0].notes).toBe('remote');
  });

  it('adds remote item that has no local copy', () => {
    const local: OwnedLegoItem[] = [];
    const remote = [makeItem('new-item', '2024-01-01T00:00:00.000Z')];
    const result = reconcileCollection(local, remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('new-item');
  });

  it('preserves local-only item not present in remote', () => {
    const local = [makeItem('local-only', '2024-01-01T00:00:00.000Z')];
    const remote: OwnedLegoItem[] = [];
    const result = reconcileCollection(local, remote, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('local-only');
  });

  it('removes local item that appears in tombstoneIds', () => {
    const local = [makeItem('a', '2024-01-01T00:00:00.000Z')];
    const result = reconcileCollection(local, [], ['a']);
    expect(result).toHaveLength(0);
  });

  it('tombstone beats a locally-newer edit (tombstone applied first)', () => {
    const local = [makeItem('a', '2024-01-10T00:00:00.000Z', { notes: 'edited locally' })];
    const result = reconcileCollection(local, [], ['a']);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when both local and remote are empty', () => {
    expect(reconcileCollection([], [], [])).toEqual([]);
  });

  it('handles multiple items correctly', () => {
    const local = [
      makeItem('a', '2024-01-01T00:00:00.000Z', { notes: 'local-a' }),
      makeItem('b', '2024-01-03T00:00:00.000Z', { notes: 'local-b-newer' }),
      makeItem('c', '2024-01-01T00:00:00.000Z', { notes: 'local-only' }),
    ];
    const remote = [
      makeItem('a', '2024-01-02T00:00:00.000Z', { notes: 'remote-a-newer' }),
      makeItem('b', '2024-01-01T00:00:00.000Z', { notes: 'remote-b' }),
      makeItem('d', '2024-01-01T00:00:00.000Z', { notes: 'remote-only' }),
    ];
    const result = reconcileCollection(local, remote, []);
    const byId = Object.fromEntries(result.map(i => [i.id, i]));
    expect(byId['a'].notes).toBe('remote-a-newer');
    expect(byId['b'].notes).toBe('local-b-newer');
    expect(byId['c'].notes).toBe('local-only');
    expect(byId['d'].notes).toBe('remote-only');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/domain/sync.test.ts
```

Expected: FAIL — `Cannot find module './sync'`

- [ ] **Step 3: Implement `reconcileCollection`**

Create `packages/core/src/domain/sync.ts`:

```typescript
import type { OwnedLegoItem } from '../types/lego';

export function reconcileCollection(
  local: OwnedLegoItem[],
  remote: OwnedLegoItem[],
  tombstoneIds: string[],
): OwnedLegoItem[] {
  const tombstoneSet = new Set(tombstoneIds);

  // Step 1: remove tombstoned items from local
  const survivors = local.filter(item => !tombstoneSet.has(item.id));

  // Step 2: build a map of survivors for O(1) lookup
  const localMap = new Map(survivors.map(item => [item.id, item]));

  // Step 3: merge remote items (remote wins on tie or remote-newer)
  for (const remoteItem of remote) {
    const localItem = localMap.get(remoteItem.id);
    if (!localItem || remoteItem.updatedAt >= localItem.updatedAt) {
      localMap.set(remoteItem.id, remoteItem);
    }
  }

  return Array.from(localMap.values());
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/domain/sync.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Re-export from `packages/core/src/index.ts`**

Add this line after the existing `export * from './domain/collection';`:

```typescript
export * from './domain/sync';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/sync.ts packages/core/src/domain/sync.test.ts packages/core/src/index.ts
git commit -m "feat(core): add reconcileCollection with LWW and tombstone support"
```

---

## Task 4: Extend Supabase service — `loadCollectionFromCloud` + updated `syncCollectionToCloud`

**Files:**

- Modify: `packages/core/src/services/supabase.ts`
- Modify: `packages/core/src/services/supabase.test.ts`

`★ Insight:` `user_collection` stores only a foreign key to `catalog_cache`, not the catalog fields. Use Supabase's nested select `*, catalog_cache!item_id(*)` to reconstruct the full `OwnedLegoItem` in a single query instead of N+1 requests.

- [ ] **Step 1: Write the new and updated tests first**

Replace the entire `packages/core/src/services/supabase.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedItemByBarcode,
  getCachedItem,
  cacheCatalogItem,
  syncCollectionToCloud,
  loadCollectionFromCloud,
  isSupabaseConfigured,
} from './supabase';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../config', () => ({ getConfig: vi.fn() }));

function makeMockClient(queryResult: { data: any; error: any } = { data: null, error: null }) {
  const client: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    // makes the builder thenable for multi-row queries: await client.from().select().eq()
    then: (resolve: (v: any) => any) => Promise.resolve(queryResult).then(resolve),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };
  (createClient as any).mockReturnValue(client);
  return client;
}

const catalogRow = {
  id: 'set-10305', type: 'set', number: '10305',
  name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
  piece_count: 4514, retired: false, estimated_value: 399.99,
  image_url: 'http://example.com/10305.jpg', barcode: '673419357562',
};

const collectionRow = {
  item_id: 'set-10305',
  status: 'collection',
  acquired_quality: 'new',
  saved_box: true,
  build_status: 'not-started',
  display_location: 'shelf',
  notes: '',
  missing_parts: '',
  quantity: 1,
  added_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  deleted_at: null,
  catalog_cache: catalogRow,
};

const ownedItem = {
  id: 'set-10305', type: 'set' as const, number: '10305',
  name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
  pieceCount: 4514, retired: false, estimatedValue: 399.99,
  imageUrl: 'http://example.com/10305.jpg', barcode: '673419357562',
  status: 'collection' as const, acquiredQuality: 'new' as const,
  savedBox: true, buildStatus: 'not-started' as const,
  displayLocation: 'shelf', notes: '', missingParts: '',
  quantity: 1, addedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('Supabase Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getConfig as any).mockReturnValue({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'test-key',
    });
  });

  describe('getCachedItemByBarcode', () => {
    it('returns item when barcode exists in cache', async () => {
      const client = makeMockClient();
      client.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'set-10305', type: 'set', number: '10305',
          name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
          piece_count: 4514, image_url: 'http://example.com/10305.jpg',
          barcode: '673419357562',
        },
        error: null,
      });
      const item = await getCachedItemByBarcode('673419357562');
      expect(client.from).toHaveBeenCalledWith('catalog_cache');
      expect(client.eq).toHaveBeenCalledWith('barcode', '673419357562');
      expect(item?.id).toBe('set-10305');
      expect(item?.pieceCount).toBe(4514);
    });

    it('returns null when barcode is not found', async () => {
      makeMockClient();
      expect(await getCachedItemByBarcode('non-existent')).toBeNull();
    });

    it('returns null when supabase returns an error', async () => {
      const client = makeMockClient();
      client.maybeSingle.mockResolvedValueOnce({
        data: null, error: { message: 'connection timeout' },
      });
      expect(await getCachedItemByBarcode('any-barcode')).toBeNull();
    });

    it('returns null and skips createClient when not configured', async () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
      expect(await getCachedItemByBarcode('any-barcode')).toBeNull();
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe('getCachedItem', () => {
    it('returns item when id exists in cache', async () => {
      const client = makeMockClient();
      client.maybeSingle.mockResolvedValueOnce({
        data: {
          id: 'set-10305', type: 'set', number: '10305',
          name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
          piece_count: 4514, image_url: 'http://example.com/10305.jpg',
          barcode: '673419357562',
        },
        error: null,
      });
      const item = await getCachedItem('set-10305');
      expect(client.from).toHaveBeenCalledWith('catalog_cache');
      expect(client.eq).toHaveBeenCalledWith('id', 'set-10305');
      expect(item?.id).toBe('set-10305');
    });

    it('returns null when id is not found', async () => {
      makeMockClient();
      expect(await getCachedItem('set-99999')).toBeNull();
    });

    it('returns null on supabase error', async () => {
      const client = makeMockClient();
      client.maybeSingle.mockResolvedValueOnce({
        data: null, error: { message: 'DB error' },
      });
      expect(await getCachedItem('set-10305')).toBeNull();
    });

    it('returns null and skips createClient when not configured', async () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
      expect(await getCachedItem('set-10305')).toBeNull();
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe('cacheCatalogItem', () => {
    const catalogItem = {
      id: 'set-10305', type: 'set' as const, number: '10305',
      name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
      pieceCount: 4514, retired: false, estimatedValue: 399.99,
      imageUrl: 'http://example.com/10305.jpg', barcode: '673419357562',
    };

    it('upserts item to catalog_cache with snake_case fields', async () => {
      const client = makeMockClient();
      await cacheCatalogItem(catalogItem);
      expect(client.from).toHaveBeenCalledWith('catalog_cache');
      expect(client.upsert).toHaveBeenCalledWith(expect.objectContaining({
        id: 'set-10305',
        piece_count: 4514,
        image_url: 'http://example.com/10305.jpg',
      }));
    });

    it('logs error but does not throw when upsert fails', async () => {
      const client = makeMockClient();
      client.upsert.mockResolvedValueOnce({ error: { message: 'upsert failed' } });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(cacheCatalogItem(catalogItem)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('returns early without calling createClient when not configured', async () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
      await cacheCatalogItem(catalogItem);
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe('loadCollectionFromCloud', () => {
    it('returns null when not configured', async () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
      expect(await loadCollectionFromCloud()).toBeNull();
      expect(createClient).not.toHaveBeenCalled();
    });

    it('returns null when user is not authenticated', async () => {
      makeMockClient();
      expect(await loadCollectionFromCloud()).toBeNull();
    });

    it('returns empty items and tombstoneIds when collection is empty', async () => {
      const client = makeMockClient({ data: [], error: null });
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      const result = await loadCollectionFromCloud();
      expect(result).toEqual({ items: [], tombstoneIds: [] });
    });

    it('splits live rows into items and deleted rows into tombstoneIds', async () => {
      const deletedRow = { ...collectionRow, item_id: 'set-99999', deleted_at: '2024-01-05T00:00:00.000Z', catalog_cache: { ...catalogRow, id: 'set-99999' } };
      const client = makeMockClient({ data: [collectionRow, deletedRow], error: null });
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      const result = await loadCollectionFromCloud();
      expect(result?.items).toHaveLength(1);
      expect(result?.items[0].id).toBe('set-10305');
      expect(result?.tombstoneIds).toEqual(['set-99999']);
    });

    it('maps DB column names to OwnedLegoItem camelCase fields', async () => {
      const client = makeMockClient({ data: [collectionRow], error: null });
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      const result = await loadCollectionFromCloud();
      const item = result?.items[0];
      expect(item?.pieceCount).toBe(4514);
      expect(item?.imageUrl).toBe('http://example.com/10305.jpg');
      expect(item?.buildStatus).toBe('not-started');
      expect(item?.displayLocation).toBe('shelf');
      expect(item?.addedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(item?.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('returns null when query returns an error', async () => {
      const client = makeMockClient({ data: null, error: { message: 'DB error' } });
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      expect(await loadCollectionFromCloud()).toBeNull();
    });
  });

  describe('syncCollectionToCloud', () => {
    it('returns early without calling createClient when not configured', async () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
      await syncCollectionToCloud([{ type: 'upsert', item: ownedItem }]);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('returns early when queue is empty', async () => {
      makeMockClient();
      await syncCollectionToCloud([]);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('returns early when user is not authenticated', async () => {
      const client = makeMockClient();
      await syncCollectionToCloud([{ type: 'upsert', item: ownedItem }]);
      expect(client.upsert).not.toHaveBeenCalled();
    });

    it('upserts items with correct shape for upsert entries', async () => {
      const client = makeMockClient();
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      await syncCollectionToCloud([{ type: 'upsert', item: ownedItem }]);
      expect(client.from).toHaveBeenCalledWith('user_collection');
      expect(client.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            item_id: 'set-10305',
            user_id: 'user-123',
            status: 'collection',
            added_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            deleted_at: null,
          }),
        ]),
        { onConflict: 'item_id,user_id' },
      );
    });

    it('calls update with deleted_at for delete entries', async () => {
      const client = makeMockClient();
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      await syncCollectionToCloud([{ type: 'delete', itemId: 'set-10305', deletedAt: '2024-02-01T00:00:00.000Z' }]);
      expect(client.update).toHaveBeenCalledWith({ deleted_at: '2024-02-01T00:00:00.000Z' });
    });

    it('throws when upsert returns an error', async () => {
      const client = makeMockClient();
      client.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-123' } }, error: null });
      client.upsert.mockResolvedValueOnce({ error: { message: 'sync failed' } });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(syncCollectionToCloud([{ type: 'upsert', item: ownedItem }]))
        .rejects.toMatchObject({ message: 'sync failed' });
      spy.mockRestore();
    });
  });

  describe('isSupabaseConfigured', () => {
    it('returns true when url and key are present', () => {
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('returns false when supabaseUrl is null', () => {
      (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: 'key' });
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('returns false when supabaseAnonKey is null', () => {
      (getConfig as any).mockReturnValue({
        supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: null,
      });
      expect(isSupabaseConfigured()).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: FAIL — `loadCollectionFromCloud is not exported`, and several `syncCollectionToCloud` tests fail due to signature mismatch.

- [ ] **Step 3: Update `packages/core/src/services/supabase.ts`**

Replace the entire file with:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { LegoCatalogItem, LegoItemType, OwnedLegoItem, SyncQueueEntry } from '../types/lego';
import { getConfig } from '../config';

function getClient() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
}

function isValidLegoType(type: any): type is LegoItemType {
  return type === 'set' || type === 'minifig';
}

function mapRowToItem(data: any): LegoCatalogItem {
  return {
    id: data.id,
    type: isValidLegoType(data.type) ? data.type : 'set',
    number: data.number,
    name: data.name,
    theme: data.theme,
    year: data.year,
    pieceCount: data.piece_count,
    retired: data.retired ?? false,
    estimatedValue: data.estimated_value ?? 0,
    imageUrl: data.image_url,
    barcode: data.barcode,
  };
}

function mapRowToOwnedItem(row: any): OwnedLegoItem {
  const catalog = row.catalog_cache;
  return {
    id: catalog.id,
    type: isValidLegoType(catalog.type) ? catalog.type : 'set',
    number: catalog.number,
    name: catalog.name,
    theme: catalog.theme,
    year: catalog.year,
    pieceCount: catalog.piece_count,
    retired: catalog.retired ?? false,
    estimatedValue: catalog.estimated_value ?? 0,
    imageUrl: catalog.image_url,
    barcode: catalog.barcode,
    status: row.status,
    acquiredQuality: row.acquired_quality,
    savedBox: row.saved_box,
    buildStatus: row.build_status,
    displayLocation: row.display_location ?? '',
    notes: row.notes ?? '',
    missingParts: row.missing_parts ?? '',
    quantity: row.quantity,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Catalog Cache Services
 */

export async function getCachedItem(id: string): Promise<LegoCatalogItem | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('catalog_cache')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  return mapRowToItem(data);
}

export async function getCachedItemByBarcode(barcode: string): Promise<LegoCatalogItem | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('catalog_cache')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();

  if (error || !data) return null;

  return mapRowToItem(data);
}

export async function cacheCatalogItem(item: LegoCatalogItem) {
  const supabase = getClient();
  if (!supabase) return;

  const { error } = await supabase.from('catalog_cache').upsert({
    id: item.id,
    type: item.type,
    number: item.number,
    name: item.name,
    theme: item.theme,
    year: item.year,
    piece_count: item.pieceCount,
    retired: item.retired,
    estimated_value: item.estimatedValue,
    image_url: item.imageUrl,
    barcode: item.barcode,
  });

  if (error) {
    console.error(`Failed to cache catalog item ${item.id}:`, error.message);
  }
}

/**
 * Collection Sync Services
 */

export async function loadCollectionFromCloud(): Promise<{ items: OwnedLegoItem[]; tombstoneIds: string[] } | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_collection')
    .select('*, catalog_cache!item_id(*)')
    .eq('user_id', user.id);

  if (error || !data) return null;

  const items = (data as any[])
    .filter(row => !row.deleted_at)
    .map(mapRowToOwnedItem);

  const tombstoneIds = (data as any[])
    .filter(row => row.deleted_at)
    .map(row => row.item_id);

  return { items, tombstoneIds };
}

export async function syncCollectionToCloud(queue: SyncQueueEntry[]): Promise<void> {
  const supabase = getClient();
  if (!supabase || queue.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const upsertEntries = queue.filter((e): e is Extract<SyncQueueEntry, { type: 'upsert' }> => e.type === 'upsert');
  const deleteEntries = queue.filter((e): e is Extract<SyncQueueEntry, { type: 'delete' }> => e.type === 'delete');

  if (upsertEntries.length > 0) {
    const rows = upsertEntries.map(e => ({
      item_id: e.item.id,
      user_id: user.id,
      status: e.item.status,
      acquired_quality: e.item.acquiredQuality,
      saved_box: e.item.savedBox,
      build_status: e.item.buildStatus,
      display_location: e.item.displayLocation,
      notes: e.item.notes,
      missing_parts: e.item.missingParts,
      quantity: e.item.quantity,
      added_at: e.item.addedAt,
      updated_at: e.item.updatedAt,
      deleted_at: null,
    }));

    const { error } = await supabase
      .from('user_collection')
      .upsert(rows, { onConflict: 'item_id,user_id' });

    if (error) {
      console.error('Cloud sync error:', error.message);
      throw error;
    }
  }

  for (const entry of deleteEntries) {
    const { error } = await (supabase
      .from('user_collection')
      .update({ deleted_at: entry.deletedAt })
      .eq('item_id', entry.itemId)
      .eq('user_id', user.id) as any);

    if (error) {
      console.error('Cloud delete error:', error.message);
      throw error;
    }
  }
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full core test suite to check for regressions**

```bash
cd packages/core && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/supabase.ts packages/core/src/services/supabase.test.ts
git commit -m "feat(core): add loadCollectionFromCloud, update syncCollectionToCloud for queue-based push"
```

---

## Task 5: Implement sync queue (TDD)

**Files:**

- Create: `apps/web/src/services/syncQueue.test.ts`
- Create: `apps/web/src/services/syncQueue.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/services/syncQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSyncQueue, saveSyncQueue, enqueueMutation, clearSyncQueue } from './syncQueue';
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
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/web && npx vitest run src/services/syncQueue.test.ts
```

Expected: FAIL — `Cannot find module './syncQueue'`

- [ ] **Step 3: Implement `syncQueue.ts`**

Create `apps/web/src/services/syncQueue.ts`:

```typescript
import type { SyncQueueEntry } from '@anti-kragle/core';

const QUEUE_KEY = 'brick-ledger.sync-queue.v1';

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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/web && npx vitest run src/services/syncQueue.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Run full web test suite**

```bash
cd apps/web && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/services/syncQueue.ts apps/web/src/services/syncQueue.test.ts
git commit -m "feat(web): add sync queue with localStorage persistence and deduplication"
```

---

## Task 6: Implement reconcile orchestration

**Files:**

- Create: `apps/web/src/services/reconcile.ts`

No unit tests — this function composes already-tested pieces and is covered at the integration/E2E level.

- [ ] **Step 1: Create `apps/web/src/services/reconcile.ts`**

```typescript
import { loadCollectionFromCloud, reconcileCollection, syncCollectionToCloud } from '@anti-kragle/core';
import { loadCollection, saveCollection } from './storage';
import { clearSyncQueue, loadSyncQueue } from './syncQueue';

export async function reconcile(): Promise<void> {
  const cloudResult = await loadCollectionFromCloud();
  if (!cloudResult) return; // not configured or unauthenticated — no-op

  const local = loadCollection();
  const merged = reconcileCollection(local, cloudResult.items, cloudResult.tombstoneIds);
  saveCollection(merged);

  const queue = loadSyncQueue();
  await syncCollectionToCloud(queue); // throws on network error — caller handles
  clearSyncQueue();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/reconcile.ts
git commit -m "feat(web): add reconcile orchestration (pull→merge→push)"
```

---

## Task 7: Implement `useSync` hook

**Files:**

- Create: `apps/web/src/hooks/useSync.ts`

- [ ] **Step 1: Create the `hooks` directory and `useSync.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SyncStatus } from '@anti-kragle/core';
import { reconcile } from '../services/reconcile';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSync(): { status: SyncStatus; triggerSync: () => void } {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    setStatus('syncing');
    try {
      await reconcile();
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(runSync, SYNC_INTERVAL_MS);
  }, [runSync]);

  useEffect(() => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }

    runSync();
    startInterval();

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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync, startInterval]);

  return { status, triggerSync: runSync };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useSync.ts
git commit -m "feat(web): add useSync hook with interval and online/offline handling"
```

---

## Task 8: Implement `SyncStatus` component

**Files:**

- Create: `apps/web/src/components/SyncStatus.tsx`

- [ ] **Step 1: Create `apps/web/src/components/SyncStatus.tsx`**

```tsx
import React from 'react';
import { Cloud, CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import type { SyncStatus } from '@anti-kragle/core';

interface Props {
  status: SyncStatus;
  onRetry: () => void;
}

export function SyncStatus({ status, onRetry }: Props) {
  if (status === 'idle') return null;

  if (status === 'syncing') {
    return (
      <div className="sync-status sync-status--syncing" data-testid="sync-status-syncing">
        <RefreshCw size={14} className="spinning" />
        <span>Syncing…</span>
      </div>
    );
  }

  if (status === 'offline') {
    return (
      <div className="sync-status sync-status--offline" data-testid="sync-status-offline">
        <WifiOff size={14} />
        <span>Offline — changes will sync when reconnected</span>
      </div>
    );
  }

  // error
  return (
    <div className="sync-status sync-status--error" data-testid="sync-status-error">
      <CloudOff size={14} />
      <span>Sync failed</span>
      <button type="button" onClick={onRetry} data-testid="sync-status-retry">
        Retry
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/SyncStatus.tsx
git commit -m "feat(web): add SyncStatus component with syncing/offline/error states"
```

---

## Task 9: Wire `App.tsx`

**Files:**

- Modify: `apps/web/src/app/App.tsx`

This task removes the old manual sync UI and wires up `useSync`, `enqueueMutation`, and `SyncStatus`.

- [ ] **Step 1: Replace `App.tsx` with the updated version**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  Box,
  Check,
  Download,
  Heart,
  LayoutGrid,
  Library,
  PackageCheck,
  Search,
} from 'lucide-react';
import {
  CollectionStatus,
  LegoCatalogItem,
  OwnedLegoItem,
  collectionToCSV,
  collectionToJSON,
  createOwnedItem,
  downloadBlob,
  findByBarcode,
  searchCatalog,
  seedCatalog,
  setConfig,
  summarizeCollection,
  upsertOwnedItem,
} from '@anti-kragle/core';
import { loadCollection, saveCollection } from '../services/storage';
import { enqueueMutation } from '../services/syncQueue';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { ItemList } from '../components/ItemList';
import { DetailPanel } from '../components/DetailPanel';
import { Stat } from '../components/Stat';
import { SyncStatus } from '../components/SyncStatus';
import { useSync } from '../hooks/useSync';

setConfig({
  rebrickableApiKey: import.meta.env.VITE_REBRICKABLE_API_KEY,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

export type ViewMode = 'collection' | 'wishlist' | 'catalog';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function App() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<OwnedLegoItem[]>(() => loadCollection());
  const [activeView, setActiveView] = useState<ViewMode>('catalog');
  const [selectedItemId, setSelectedItemId] = useState<string>(seedCatalog[0]?.id ?? '');
  const [catalogResults, setCatalogResults] = useState<LegoCatalogItem[]>(seedCatalog);
  const [isSearching, setIsSearching] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [isScanningBarcode, setIsScanningBarcode] = useState(false);

  const { status: syncStatus, triggerSync } = useSync();

  useEffect(() => {
    saveCollection(items);
  }, [items]);

  useEffect(() => {
    const handler = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchCatalog(query);
        setCatalogResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [query]);

  const summary = useMemo(() => summarizeCollection(items), [items]);
  const selectedOwnedItem = items.find((item) => item.id === selectedItemId);
  const selectedCatalogItem = catalogResults.find((item) => item.id === selectedItemId);
  const selectedItem = selectedOwnedItem ?? selectedCatalogItem;
  const visibleOwnedItems = items.filter((item) => item.status === activeView);

  function addItem(item: LegoCatalogItem, status: CollectionStatus) {
    const ownedItem = createOwnedItem(item, status);
    setItems((currentItems) => upsertOwnedItem(currentItems, ownedItem));
    enqueueMutation({ type: 'upsert', item: ownedItem });
    setSelectedItemId(item.id);
    setActiveView(status);
  }

  function updateSelectedItem(patch: Partial<OwnedLegoItem>) {
    if (!selectedOwnedItem) return;
    const updatedItem = { ...selectedOwnedItem, ...patch, updatedAt: new Date().toISOString() };
    setItems((currentItems) => upsertOwnedItem(currentItems, updatedItem));
    enqueueMutation({ type: 'upsert', item: updatedItem });
  }

  function removeSelectedItem() {
    if (!selectedOwnedItem) return;
    setItems((currentItems) => currentItems.filter((item) => item.id !== selectedOwnedItem.id));
    enqueueMutation({ type: 'delete', itemId: selectedOwnedItem.id, deletedAt: new Date().toISOString() });
    setActiveView('catalog');
  }

  async function handleBarcode(barcode: string) {
    if (!barcode.trim() || isScanningBarcode) return;

    setIsScanningBarcode(true);
    setScanMessage(`Searching for ${barcode}...`);

    try {
      const match = await findByBarcode(barcode);
      if (!match) {
        setQuery(barcode);
        setScanMessage(`Barcode ${barcode} not found in catalog. Search filled.`);
        return;
      }

      setScannerOpen(false);
      setScanMessage(`Found ${match.name}`);
      addItem(match, 'collection');
    } catch {
      setScanMessage(`Error searching for barcode ${barcode}.`);
    } finally {
      setIsScanningBarcode(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <Box size={24} />
          </div>
          <div>
            <h1>Anti-Kragle</h1>
            <p>Collection tracker</p>
          </div>
        </div>

        <div className="summary-grid">
          <Stat label="Owned" value={summary.collectionCount.toString()} icon={<Library size={18} />} />
          <Stat label="Wishlist" value={summary.wishlistCount.toString()} icon={<Heart size={18} />} />
          <Stat label="Value" value={formatCurrency(summary.totalEstimatedValue)} icon={<PackageCheck size={18} />} />
          <Stat label="Built" value={summary.completeBuilds.toString()} icon={<Check size={18} />} />
        </div>

        <div className="export-actions">
          <button className="text-button" type="button" onClick={() => downloadBlob(collectionToJSON(items), 'lego-collection.json', 'application/json')}>
            <Download size={14} /> JSON
          </button>
          <button className="text-button" type="button" onClick={() => downloadBlob(collectionToCSV(items), 'lego-collection.csv', 'text/csv')}>
            <Download size={14} /> CSV
          </button>
        </div>

        <SyncStatus status={syncStatus} onRetry={triggerSync} />

        <div className="toolbar">
          <label className="search-box">
            <Search size={18} className={isSearching ? 'spinning' : ''} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search set..." />
          </label>
          <button className="icon-button" type="button" onClick={() => setScannerOpen(true)}>
            <Barcode size={20} />
          </button>
        </div>

        {scanMessage ? <p className="scan-message">{scanMessage}</p> : null}

        <nav className="tabs">
          <button className={activeView === 'catalog' ? 'active' : ''} onClick={() => setActiveView('catalog')}><LayoutGrid size={16} /> Catalog</button>
          <button className={activeView === 'collection' ? 'active' : ''} onClick={() => setActiveView('collection')}><Library size={16} /> Collection</button>
          <button className={activeView === 'wishlist' ? 'active' : ''} onClick={() => setActiveView('wishlist')}><Heart size={16} /> Wishlist</button>
        </nav>

        <ItemList
          activeView={activeView}
          catalogItems={catalogResults}
          ownedItems={visibleOwnedItems}
          selectedItemId={selectedItem?.id}
          onSelect={setSelectedItemId}
          onAdd={addItem}
        />
      </section>

      <DetailPanel
        item={selectedItem}
        ownedItem={selectedOwnedItem}
        onAdd={addItem}
        onUpdate={updateSelectedItem}
        onRemove={removeSelectedItem}
      />

      {scannerOpen ? (
        <BarcodeScanner
          isScanning={isScanningBarcode}
          onClose={() => setScannerOpen(false)}
          onDetected={handleBarcode}
          statusMessage={scanMessage}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
cd packages/core && npx vitest run
cd apps/web && npx vitest run
```

Expected: all tests PASS (84+ tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/App.tsx
git commit -m "feat(web): wire useSync, SyncStatus, and enqueueMutation into App"
```

---

## Final verification

- [ ] **Run full test suite one more time**

```bash
cd packages/core && npx vitest run && cd ../.. && cd apps/web && npx vitest run
```

Expected: all tests PASS.

- [ ] **Update roadmap**

In `docs/roadmap.md`, mark the M3 task complete:

```markdown
  - [x] Multi-device state reconciliation
```

- [ ] **Commit roadmap**

```bash
git add docs/roadmap.md
git commit -m "chore(roadmap): mark M3 multi-device reconciliation complete"
```
