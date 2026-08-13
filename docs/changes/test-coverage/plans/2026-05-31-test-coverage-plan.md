# Plan: Test Coverage Fixes

**Date:** 2026-05-31 | **Tasks:** 10 | **Time:** ~42 min

## Goal

All exported functions in `packages/core` and `apps/web/src/services` have test
coverage, the `rebrickable.test.ts` latent `retryAfter: NaN` bug is fixed, and
`npx vitest run` passes in both packages.

## Observable Truths (Acceptance Criteria)

1. `packages/core` vitest suite passes with ≥40 tests across catalog, collection,
   export, rebrickable, and supabase test files.
2. `apps/web` vitest suite passes with ≥10 tests across storage and barcode.
3. `supabase.test.ts` covers all 5 exported functions and uses a per-test mock
   factory (no module-level shared mutation).
4. `rebrickable.test.ts` asserts `error.retryAfter === 30` (not `NaN`) and covers
   `findRebrickableItem` and the minifig fallback path.
5. `catalog.test.ts` covers `findCatalogItem` across all 5 branches plus error paths.
6. `harness validate` passes after every task.

## Uncertainties

- `[ASSUMPTION]` `apps/web` vite.config.ts accepts a `test: { environment: 'jsdom' }`
  block — vitest supports this natively via the vite plugin.
- `[DEFERRABLE]` Whether `barcode.ts` needs a full jsdom `HTMLVideoElement` stub —
  `document.createElement('video')` in jsdom is sufficient; no real video stream needed.

## File Map

```text
MODIFY packages/core/src/services/supabase.test.ts
MODIFY packages/core/src/services/rebrickable.test.ts
MODIFY packages/core/src/domain/catalog.test.ts
CREATE packages/core/src/domain/collection.test.ts
CREATE packages/core/src/domain/export.test.ts
MODIFY apps/web/package.json
MODIFY apps/web/vite.config.ts
CREATE apps/web/src/services/storage.test.ts
CREATE apps/web/src/services/barcode.test.ts
```

---

## Tasks

### Task 1: Refactor supabase.test.ts mock to factory pattern

**Depends on:** none | **Files:** `packages/core/src/services/supabase.test.ts`

Replace the module-level shared `mockSupabase` const with a `makeMockClient()`
factory. Update existing `getCachedItemByBarcode` tests to use it. Fix the
unconfigured test to assert `createClient` was never called.

1. Run existing tests to confirm baseline passes:

   ```sh
   npx vitest run packages/core/src/services/supabase.test.ts
   ```

2. Rewrite `packages/core/src/services/supabase.test.ts` to:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { getCachedItemByBarcode } from './supabase';
   import { createClient } from '@supabase/supabase-js';
   import { getConfig } from '../config';

   vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
   vi.mock('../config', () => ({ getConfig: vi.fn() }));

   function makeMockClient() {
     const client = {
       from: vi.fn().mockReturnThis(),
       select: vi.fn().mockReturnThis(),
       eq: vi.fn().mockReturnThis(),
       maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
       upsert: vi.fn().mockResolvedValue({ error: null }),
       auth: {
         getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
       },
     };
     (createClient as any).mockReturnValue(client);
     return client;
   }

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
   });
   ```

3. Run — all 4 must pass:

   ```sh
   npx vitest run packages/core/src/services/supabase.test.ts
   ```

4. Run: `harness validate`

5. Commit:

   ```text
   refactor(supabase-test): replace shared mock with per-test factory
   ```

---

### Task 2: Add getCachedItem and cacheCatalogItem tests

**Depends on:** Task 1 | **Files:** `packages/core/src/services/supabase.test.ts`

1. Add `getCachedItem` and `cacheCatalogItem` to the import line:

   ```typescript
   import { getCachedItemByBarcode, getCachedItem, cacheCatalogItem } from './supabase';
   ```

2. Append two `describe` blocks inside `describe('Supabase Service', ...)` after
   the existing `getCachedItemByBarcode` block:

   ```typescript
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
   ```

3. Run — expected 11 tests pass:

   ```sh
   npx vitest run packages/core/src/services/supabase.test.ts
   ```

4. Run: `harness validate`

5. Commit:

   ```text
   test(supabase): add getCachedItem and cacheCatalogItem coverage
   ```

---

### Task 3: Add syncCollectionToCloud and isSupabaseConfigured tests

**Depends on:** Task 2 | **Files:** `packages/core/src/services/supabase.test.ts`

1. Add `syncCollectionToCloud, isSupabaseConfigured` to the import line.

2. Add an `ownedItem` fixture after the `makeMockClient` function (before the
   outer `describe` block):

   ```typescript
   const ownedItem = {
     id: 'set-10305', type: 'set' as const, number: '10305',
     name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
     pieceCount: 4514, retired: false, estimatedValue: 399.99,
     imageUrl: 'http://example.com/10305.jpg', barcode: '673419357562',
     status: 'collection' as const, acquiredQuality: 'new' as const,
     savedBox: true, buildStatus: 'not-started' as const,
     displayLocation: '', notes: '', missingParts: '',
     quantity: 1, addedAt: '2024-01-01T00:00:00.000Z',
     updatedAt: '2024-01-01T00:00:00.000Z',
   };
   ```

3. Append two `describe` blocks inside `describe('Supabase Service', ...)`:

   ```typescript
   describe('syncCollectionToCloud', () => {
     it('returns early without calling createClient when not configured', async () => {
       (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
       await syncCollectionToCloud([ownedItem]);
       expect(createClient).not.toHaveBeenCalled();
     });

     it('throws when user is not authenticated', async () => {
       makeMockClient();
       await expect(syncCollectionToCloud([ownedItem]))
         .rejects.toThrow('Authentication required for cloud sync');
     });

     it('upserts items with correct shape when authenticated', async () => {
       const client = makeMockClient();
       client.auth.getUser.mockResolvedValueOnce({
         data: { user: { id: 'user-123' } }, error: null,
       });
       await syncCollectionToCloud([ownedItem]);
       expect(client.from).toHaveBeenCalledWith('user_collection');
       expect(client.upsert).toHaveBeenCalledWith(
         expect.arrayContaining([
           expect.objectContaining({
             item_id: 'set-10305',
             user_id: 'user-123',
             status: 'collection',
           }),
         ]),
         { onConflict: 'item_id,user_id' },
       );
     });

     it('throws when upsert returns an error', async () => {
       const client = makeMockClient();
       client.auth.getUser.mockResolvedValueOnce({
         data: { user: { id: 'user-123' } }, error: null,
       });
       client.upsert.mockResolvedValueOnce({ error: { message: 'sync failed' } });
       const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
       await expect(syncCollectionToCloud([ownedItem]))
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
   ```

4. Run — expected 18 tests pass:

   ```sh
   npx vitest run packages/core/src/services/supabase.test.ts
   ```

5. Run: `harness validate`

6. Commit:

   ```text
   test(supabase): add syncCollectionToCloud and isSupabaseConfigured coverage
   ```

---

### Task 4: Fix rebrickable.test.ts — headers bug, findRebrickableItem, minifig fallback

**Depends on:** none | **Files:** `packages/core/src/services/rebrickable.test.ts`

1. Add `findRebrickableItem` to the import line:

   ```typescript
   import { searchRebrickable, findRebrickableByBarcode, findRebrickableItem } from './rebrickable';
   ```

2. Fix the `new Map(...)` headers mock in `findRebrickableByBarcode` 429 test.
   Replace:

   ```typescript
   it('should throw RateLimitError on 429 rate limit', async () => {
     mockFetch.mockResolvedValueOnce({
       status: 429,
       ok: false,
       headers: new Map([['Retry-After', '30']])
     });
     await expect(findRebrickableByBarcode('5702016913484')).rejects.toThrow('rate limit exceeded');
   });
   ```

   With:

   ```typescript
   it('throws RateLimitError with correct retryAfter on 429', async () => {
     mockFetch.mockResolvedValueOnce({
       status: 429, ok: false,
       headers: { get: (k: string) => k === 'Retry-After' ? '30' : null },
     });
     await expect(findRebrickableByBarcode('5702016913484'))
       .rejects.toMatchObject({ retryAfter: 30 });
   });
   ```

3. Fix the `new Map(...)` headers mock in `searchRebrickable` 429 test.
   Replace:

   ```typescript
   it('should throw RateLimitError on 429', async () => {
     mockFetch.mockResolvedValue({
       status: 429,
       headers: new Map([['Retry-After', '30']])
     });
     await expect(searchRebrickable('star wars')).rejects.toThrow('rate limit exceeded');
   });
   ```

   With:

   ```typescript
   it('throws RateLimitError with correct retryAfter on 429', async () => {
     mockFetch.mockResolvedValue({
       status: 429,
       headers: { get: (k: string) => k === 'Retry-After' ? '30' : null },
     });
     await expect(searchRebrickable('star wars'))
       .rejects.toMatchObject({ retryAfter: 30 });
   });
   ```

4. Add minifig fallback test inside `describe('findRebrickableByBarcode', ...)`:

   ```typescript
   it('falls back to minifigs when no set found for barcode', async () => {
     mockFetch
       .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
       .mockResolvedValueOnce({
         ok: true,
         json: async () => ({
           results: [{
             set_num: 'fig-001', name: 'Luke', year: 1999,
             theme_id: 1, num_parts: 5, set_img_url: '',
           }],
         }),
       });
     const item = await findRebrickableByBarcode('1234567890');
     expect(item?.type).toBe('minifig');
     expect(item?.number).toBe('fig-001');
   });
   ```

5. Add query-length guard test inside `describe('searchRebrickable', ...)`:

   ```typescript
   it('returns empty array for queries shorter than 3 characters', async () => {
     const items = await searchRebrickable('ab');
     expect(items).toEqual([]);
     expect(mockFetch).not.toHaveBeenCalled();
   });
   ```

6. Add new `describe('findRebrickableItem', ...)` block after `searchRebrickable`:

   ```typescript
   describe('findRebrickableItem', () => {
     it('fetches a set by number using the /sets/ endpoint', async () => {
       mockFetch.mockResolvedValueOnce({
         ok: true,
         json: async () => ({
           set_num: '75312-1', name: "Boba Fett's Starship", year: 2021,
           theme_id: 158, num_parts: 593, set_img_url: 'http://example.com/75312.jpg',
         }),
       });
       const item = await findRebrickableItem('75312-1', 'set');
       expect(item?.type).toBe('set');
       expect(item?.number).toBe('75312-1');
       expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sets/75312-1/'));
     });

     it('fetches a minifig using the /minifigs/ endpoint', async () => {
       mockFetch.mockResolvedValueOnce({
         ok: true,
         json: async () => ({
           set_num: 'sw0001', name: 'Battle Droid', year: 1999,
           theme_id: 1, num_parts: 5, set_img_url: '',
         }),
       });
       const item = await findRebrickableItem('sw0001', 'minifig');
       expect(item?.type).toBe('minifig');
       expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/minifigs/sw0001/'));
     });

     it('returns null when the API returns a non-ok response', async () => {
       mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
       expect(await findRebrickableItem('99999-1', 'set')).toBeNull();
     });

     it('propagates RateLimitError', async () => {
       mockFetch.mockResolvedValueOnce({
         status: 429, ok: false,
         headers: { get: (k: string) => k === 'Retry-After' ? '60' : null },
       });
       await expect(findRebrickableItem('75312-1', 'set'))
         .rejects.toMatchObject({ retryAfter: 60 });
     });
   });
   ```

7. Run — all tests must pass (~13 total):

   ```sh
   npx vitest run packages/core/src/services/rebrickable.test.ts
   ```

8. Run: `harness validate`

9. Commit:

   ```text
   fix(rebrickable-test): fix retryAfter NaN bug; add findRebrickableItem and minifig fallback
   ```

---

### Task 5: Add findCatalogItem and error-path tests to catalog.test.ts

**Depends on:** none | **Files:** `packages/core/src/domain/catalog.test.ts`

1. Update the catalog import line to add `findCatalogItem`:

   ```typescript
   import { findByBarcode, searchCatalog, findCatalogItem, seedCatalog } from './catalog';
   ```

2. Update the supabase import to add `getCachedItem`:

   ```typescript
   import { getCachedItemByBarcode, cacheCatalogItem, getCachedItem } from '../services/supabase';
   ```

3. Update the rebrickable import to add `findRebrickableItem`:

   ```typescript
   import { findRebrickableByBarcode, searchRebrickable, findRebrickableItem } from '../services/rebrickable';
   ```

4. Append a `describe('findCatalogItem', ...)` block inside `describe('Catalog Domain', ...)`:

   ```typescript
   describe('findCatalogItem', () => {
     it('returns seed item by id without hitting cache or Rebrickable', async () => {
       const result = await findCatalogItem('set-10305');
       expect(result?.id).toBe('set-10305');
       expect(result?.name).toBe('Lion Knights Castle');
       expect(getCachedItem).not.toHaveBeenCalled();
       expect(findRebrickableItem).not.toHaveBeenCalled();
     });

     it('returns cached item when id is not in seed', async () => {
       (getCachedItem as any).mockResolvedValueOnce({
         id: 'set-99998', type: 'set', number: '99998', name: 'Cached Set',
         theme: 'Test', year: 2020, pieceCount: 100, retired: false,
         estimatedValue: 0, imageUrl: '',
       });
       const result = await findCatalogItem('set-99998');
       expect(result?.id).toBe('set-99998');
       expect(findRebrickableItem).not.toHaveBeenCalled();
     });

     it('fetches from Rebrickable for a set id not in seed or cache', async () => {
       (getCachedItem as any).mockResolvedValueOnce(null);
       const remoteItem = {
         id: 'set-99997', type: 'set' as const, number: '99997', name: 'Remote Set',
         theme: 'Test', year: 2020, pieceCount: 50, retired: false,
         estimatedValue: 0, imageUrl: '',
       };
       (findRebrickableItem as any).mockResolvedValueOnce(remoteItem);
       const result = await findCatalogItem('set-99997');
       expect(result?.id).toBe('set-99997');
       expect(findRebrickableItem).toHaveBeenCalledWith('99997', 'set');
       expect(cacheCatalogItem).toHaveBeenCalledWith(remoteItem);
     });

     it('returns undefined for an id with an unrecognised type prefix', async () => {
       (getCachedItem as any).mockResolvedValueOnce(null);
       const result = await findCatalogItem('part-12345');
       expect(result).toBeUndefined();
       expect(findRebrickableItem).not.toHaveBeenCalled();
     });

     it('returns undefined when seed, cache, and Rebrickable all miss', async () => {
       (getCachedItem as any).mockResolvedValueOnce(null);
       (findRebrickableItem as any).mockResolvedValueOnce(null);
       expect(await findCatalogItem('set-00000')).toBeUndefined();
     });
   });
   ```

5. Append error-path tests inside `describe('findByBarcode', ...)`:

   ```typescript
   it('propagates rejection from getCachedItemByBarcode', async () => {
     (getCachedItemByBarcode as any).mockRejectedValueOnce(new Error('DB down'));
     await expect(findByBarcode('9876543210987')).rejects.toThrow('DB down');
   });

   it('resolves even when background cacheCatalogItem rejects', async () => {
     (getCachedItemByBarcode as any).mockResolvedValueOnce(null);
     (findRebrickableByBarcode as any).mockResolvedValueOnce({
       id: 'set-x', type: 'set', number: 'x', name: 'X', theme: 'T',
       year: 2020, pieceCount: 1, retired: false, estimatedValue: 0, imageUrl: '',
     });
     (cacheCatalogItem as any).mockRejectedValueOnce(new Error('cache fail'));
     await expect(findByBarcode('9876543210987')).resolves.toBeDefined();
   });
   ```

6. Run — all tests must pass (~28 total):

   ```sh
   npx vitest run packages/core/src/domain/catalog.test.ts
   ```

7. Run: `harness validate`

8. Commit:

   ```text
   test(catalog): add findCatalogItem coverage and error-path tests
   ```

---

### Task 6: Create collection.test.ts

**Depends on:** none | **Files:** `packages/core/src/domain/collection.test.ts`

1. Create `packages/core/src/domain/collection.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { createOwnedItem, summarizeCollection, upsertOwnedItem } from './collection';
   import type { LegoCatalogItem, OwnedLegoItem } from '../types/lego';

   const baseCatalogItem: LegoCatalogItem = {
     id: 'set-10305', type: 'set', number: '10305',
     name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
     pieceCount: 4514, retired: false, estimatedValue: 399.99,
     imageUrl: 'https://images.brickset.com/sets/images/10305-1.jpg',
     barcode: '673419357562',
   };

   function makeOwned(
     status: 'collection' | 'wishlist',
     buildStatus: 'not-started' | 'in-progress' | 'complete' = 'not-started',
     quantity = 1,
     estimatedValue = 100,
   ): OwnedLegoItem {
     return {
       ...baseCatalogItem, status, acquiredQuality: 'new', savedBox: true,
       buildStatus, displayLocation: '', notes: '', missingParts: '',
       quantity, estimatedValue,
       addedAt: '2024-01-01T00:00:00.000Z',
       updatedAt: '2024-01-01T00:00:00.000Z',
     };
   }

   describe('collection domain', () => {
     describe('createOwnedItem', () => {
       it('creates collection item with acquiredQuality new and correct defaults', () => {
         const item = createOwnedItem(baseCatalogItem, 'collection');
         expect(item.status).toBe('collection');
         expect(item.acquiredQuality).toBe('new');
         expect(item.savedBox).toBe(true);
         expect(item.buildStatus).toBe('not-started');
         expect(item.quantity).toBe(1);
         expect(item.displayLocation).toBe('');
         expect(item.id).toBe(baseCatalogItem.id);
       });

       it('creates wishlist item without acquiredQuality', () => {
         const item = createOwnedItem(baseCatalogItem, 'wishlist');
         expect(item.status).toBe('wishlist');
         expect((item as any).acquiredQuality).toBeUndefined();
       });

       it('sets addedAt and updatedAt as valid ISO strings', () => {
         const item = createOwnedItem(baseCatalogItem, 'collection');
         expect(() => new Date(item.addedAt).toISOString()).not.toThrow();
         expect(() => new Date(item.updatedAt).toISOString()).not.toThrow();
       });
     });

     describe('summarizeCollection', () => {
       it('counts collection and wishlist items separately', () => {
         const summary = summarizeCollection([
           makeOwned('collection'), makeOwned('collection'), makeOwned('wishlist'),
         ]);
         expect(summary.collectionCount).toBe(2);
         expect(summary.wishlistCount).toBe(1);
       });

       it('sums estimated value × quantity for collection items only', () => {
         const summary = summarizeCollection([
           makeOwned('collection', 'not-started', 2, 100),
           makeOwned('wishlist', 'not-started', 1, 200),
         ]);
         expect(summary.totalEstimatedValue).toBe(200);
       });

       it('counts all items with complete buildStatus regardless of list', () => {
         const summary = summarizeCollection([
           makeOwned('collection', 'complete'),
           makeOwned('collection', 'in-progress'),
           makeOwned('wishlist', 'complete'),
         ]);
         expect(summary.completeBuilds).toBe(2);
       });

       it('returns all zeros for empty collection', () => {
         expect(summarizeCollection([])).toEqual({
           collectionCount: 0, wishlistCount: 0,
           totalEstimatedValue: 0, completeBuilds: 0,
         });
       });
     });

     describe('upsertOwnedItem', () => {
       const existingItem = makeOwned('collection');

       it('prepends new item when id does not exist in list', () => {
         const newItem = { ...existingItem, id: 'set-99999', name: 'New Set' };
         const result = upsertOwnedItem([existingItem], newItem);
         expect(result).toHaveLength(2);
         expect(result[0].id).toBe('set-99999');
       });

       it('replaces existing item in-place when id matches', () => {
         const updated = { ...existingItem, notes: 'Updated note' };
         const result = upsertOwnedItem([existingItem], updated);
         expect(result).toHaveLength(1);
         expect(result[0].notes).toBe('Updated note');
       });

       it('bumps updatedAt on every upsert', () => {
         const before = existingItem.updatedAt;
         const result = upsertOwnedItem([existingItem], { ...existingItem, notes: 'x' });
         expect(result[0].updatedAt).not.toBe(before);
       });
     });
   });
   ```

2. Run — expected 10 tests pass:

   ```sh
   npx vitest run packages/core/src/domain/collection.test.ts
   ```

3. Run: `harness validate`

4. Commit:

   ```text
   test(collection): add full domain coverage
   ```

---

### Task 7: Create export.test.ts

**Depends on:** none | **Files:** `packages/core/src/domain/export.test.ts`

1. Create `packages/core/src/domain/export.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { collectionToJSON, collectionToCSV } from './export';
   import type { OwnedLegoItem } from '../types/lego';

   const baseItem: OwnedLegoItem = {
     id: 'set-10305', type: 'set', number: '10305',
     name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
     pieceCount: 4514, retired: false, estimatedValue: 399.99,
     imageUrl: 'https://images.brickset.com/sets/images/10305-1.jpg',
     barcode: '673419357562', status: 'collection', acquiredQuality: 'new',
     savedBox: true, buildStatus: 'not-started', displayLocation: 'Office shelf',
     notes: '', missingParts: '', quantity: 1,
     addedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
   };

   describe('export domain', () => {
     describe('collectionToJSON', () => {
       it('returns valid JSON string', () => {
         expect(() => JSON.parse(collectionToJSON([baseItem]))).not.toThrow();
       });

       it('round-trips item fields through JSON', () => {
         const parsed = JSON.parse(collectionToJSON([baseItem]));
         expect(parsed[0].id).toBe('set-10305');
         expect(parsed[0].name).toBe('Lion Knights Castle');
       });

       it('returns empty array JSON for empty collection', () => {
         expect(collectionToJSON([])).toBe('[]');
       });
     });

     describe('collectionToCSV', () => {
       it('returns empty string for empty collection', () => {
         expect(collectionToCSV([])).toBe('');
       });

       it('produces header row + one data row for single item', () => {
         const lines = collectionToCSV([baseItem]).split('\n');
         expect(lines).toHaveLength(2);
         expect(lines[0]).toContain('id,type,number,name');
         expect(lines[1]).toContain('set-10305');
       });

       it('includes all expected header columns', () => {
         const headers = collectionToCSV([baseItem]).split('\n')[0].split(',');
         for (const col of ['id', 'status', 'quantity', 'addedAt']) {
           expect(headers).toContain(col);
         }
       });

       it('wraps values containing commas in double quotes', () => {
         const csv = collectionToCSV([{ ...baseItem, name: 'Castle, Lion' }]);
         expect(csv).toContain('"Castle, Lion"');
       });

       it('escapes embedded double quotes', () => {
         const csv = collectionToCSV([{ ...baseItem, notes: 'He said "cool"' }]);
         expect(csv).toContain('"He said ""cool"""');
       });
     });
   });
   ```

2. Run — expected 8 tests pass:

   ```sh
   npx vitest run packages/core/src/domain/export.test.ts
   ```

3. Run: `harness validate`

4. Commit:

   ```text
   test(export): add full domain coverage for collectionToJSON and collectionToCSV
   ```

---

### Task 8: Add vitest + jsdom to apps/web

**Depends on:** none | **Files:** `apps/web/package.json`, `apps/web/vite.config.ts`

`apps/web` currently has no vitest. This task adds it so storage and barcode
tests can run.

1. Install vitest and jsdom in `apps/web`:

   ```sh
   cd apps/web && npm install --save-dev vitest jsdom
   ```

2. Add `"test": "vitest run"` to the `scripts` block in `apps/web/package.json`.

3. Update `apps/web/vite.config.ts` to add the test block:

   ```typescript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       globals: true,
     },
   });
   ```

4. Check `apps/web/tsconfig.json` — if a `"types": [...]` array is present in
   compilerOptions, add `"vitest/globals"` to it. Otherwise skip.

5. Verify vitest starts (no test files yet, exits 0):

   ```sh
   cd apps/web && npm test
   ```

6. Run: `harness validate`

7. Commit:

   ```text
   chore(web): add vitest + jsdom for service unit tests
   ```

---

### Task 9: Create storage.test.ts

**Depends on:** Task 8 | **Files:** `apps/web/src/services/storage.test.ts`

1. Create `apps/web/src/services/storage.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach } from 'vitest';
   import { loadCollection, saveCollection } from './storage';
   import type { OwnedLegoItem } from '@anti-kragle/core';

   const baseItem: OwnedLegoItem = {
     id: 'set-10305', type: 'set', number: '10305',
     name: 'Lion Knights Castle', theme: 'Icons', year: 2022,
     pieceCount: 4514, retired: false, estimatedValue: 399.99,
     imageUrl: 'https://images.brickset.com/sets/images/10305-1.jpg',
     barcode: '673419357562', status: 'collection', acquiredQuality: 'new',
     savedBox: true, buildStatus: 'not-started', displayLocation: '',
     notes: '', missingParts: '', quantity: 1,
     addedAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
   };

   describe('storage service', () => {
     beforeEach(() => {
       localStorage.clear();
     });

     describe('loadCollection', () => {
       it('returns empty array when localStorage is empty', () => {
         expect(loadCollection()).toEqual([]);
       });

       it('returns parsed valid items from localStorage', () => {
         saveCollection([baseItem]);
         expect(loadCollection()).toHaveLength(1);
         expect(loadCollection()[0].id).toBe('set-10305');
       });

       it('filters out items that fail schema validation', () => {
         localStorage.setItem(
           'brick-ledger.collection.v1',
           JSON.stringify([baseItem, { id: 'bad', type: 'unknown' }]),
         );
         expect(loadCollection()).toHaveLength(1);
       });

       it('returns empty array on malformed JSON', () => {
         localStorage.setItem('brick-ledger.collection.v1', '{not valid json');
         expect(loadCollection()).toEqual([]);
       });

       it('returns empty array when stored value is not an array', () => {
         localStorage.setItem(
           'brick-ledger.collection.v1',
           JSON.stringify({ id: 'not-array' }),
         );
         expect(loadCollection()).toEqual([]);
       });
     });

     describe('saveCollection', () => {
       it('writes items to localStorage under the correct key', () => {
         saveCollection([baseItem]);
         const raw = localStorage.getItem('brick-ledger.collection.v1');
         expect(raw).not.toBeNull();
         expect(JSON.parse(raw!)).toHaveLength(1);
       });

       it('round-trips items through save + load', () => {
         saveCollection([baseItem]);
         expect(loadCollection()[0]).toEqual(baseItem);
       });
     });
   });
   ```

2. Run — expected 7 tests pass:

   ```sh
   cd apps/web && npm test
   ```

3. Run: `harness validate`

4. Commit:

   ```text
   test(storage): add full service coverage for loadCollection and saveCollection
   ```

---

### Task 10: Create barcode.test.ts

**Depends on:** Task 8 | **Files:** `apps/web/src/services/barcode.test.ts`

1. Create `apps/web/src/services/barcode.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { canUseBarcodeDetector, scanVideoFrame } from './barcode';

   describe('barcode service', () => {
     beforeEach(() => {
       delete (window as any).BarcodeDetector;
     });

     describe('canUseBarcodeDetector', () => {
       it('returns false when BarcodeDetector is not present on window', () => {
         expect(canUseBarcodeDetector()).toBe(false);
       });

       it('returns true when BarcodeDetector is present on window', () => {
         (window as any).BarcodeDetector = class {};
         expect(canUseBarcodeDetector()).toBe(true);
       });
     });

     describe('scanVideoFrame', () => {
       it('returns null when BarcodeDetector is unavailable', async () => {
         const video = document.createElement('video');
         expect(await scanVideoFrame(video)).toBeNull();
       });

       it('returns first detected barcode rawValue', async () => {
         const mockDetect = vi.fn().mockResolvedValue([{ rawValue: '673419357562' }]);
         (window as any).BarcodeDetector = vi.fn().mockImplementation(() => ({
           detect: mockDetect,
         }));
         const video = document.createElement('video');
         expect(await scanVideoFrame(video)).toBe('673419357562');
       });

       it('returns null when no barcodes are detected', async () => {
         const mockDetect = vi.fn().mockResolvedValue([]);
         (window as any).BarcodeDetector = vi.fn().mockImplementation(() => ({
           detect: mockDetect,
         }));
         const video = document.createElement('video');
         expect(await scanVideoFrame(video)).toBeNull();
       });

       it('constructs detector with the correct formats', async () => {
         const MockDetector = vi.fn().mockImplementation(() => ({
           detect: vi.fn().mockResolvedValue([]),
         }));
         (window as any).BarcodeDetector = MockDetector;
         await scanVideoFrame(document.createElement('video'));
         expect(MockDetector).toHaveBeenCalledWith({
           formats: ['ean_13', 'upc_a', 'code_128', 'qr_code'],
         });
       });
     });
   });
   ```

2. Run — all tests must pass (7 storage + 6 barcode = 13 total):

   ```sh
   cd apps/web && npm test
   ```

3. Run: `harness validate`

4. Commit:

   ```text
   test(barcode): add full service coverage for canUseBarcodeDetector and scanVideoFrame
   ```
