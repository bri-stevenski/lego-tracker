# Plan: Bag Parts View

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a read-only part list grouped by bag (with images) in the set detail panel, fetched from Rebrickable on first view and cached to Supabase for instant repeat loads.

**Architecture:** New `set_parts` Supabase table stores one row per (set, part, color). `getOrFetchSetParts` in catalog.ts checks Supabase first; on miss it calls Rebrickable's inventory-sets endpoint to discover bags, fetches parts per bag (with pagination), then caches. `useSetParts` hook drives loading state; `PartsList` component renders the grouped view.

**Tech Stack:** Vitest, @supabase/supabase-js v2, Rebrickable API v3, React hooks, native `<details>` for collapsible bags.

**Spec:** `docs/changes/bag-parts-view/proposal.md`
**Date:** 2026-06-03 | **Tasks:** 10 | **Time:** ~42 min

---

## Gates

- No vague tasks — every task has exact file paths, exact code, exact commands.
- No tasks larger than one context window.
- No skipping TDD — every code-producing task starts with a failing test.
- No implementation during planning.

---

## Assumptions

- Rebrickable `/sets/{set_num}/sets/` returns bag sub-sets for sets that have them. If it returns empty, the flat-list fallback (`bag_num = null`) is used.
- The web app (apps/web) has no React Testing Library setup — hook/component coverage is handled through domain-level unit tests and a manual browser verify step.

---

### Task 1: DB migration — create set_parts table

**Files:**

- Create: `supabase/migrations/20260603000000_set_parts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260603000000_set_parts.sql
CREATE TABLE public.set_parts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      TEXT NOT NULL REFERENCES public.catalog_cache(id) ON DELETE CASCADE,
  part_num    TEXT NOT NULL,
  part_name   TEXT NOT NULL,
  color_name  TEXT NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity >= 1),
  bag_num     INTEGER,
  img_url     TEXT NOT NULL,
  is_spare    BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (set_id, part_num, color_name)
);

ALTER TABLE public.set_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for set parts" ON public.set_parts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated insert for set parts" ON public.set_parts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify file exists**

```bash
ls supabase/migrations/20260603000000_set_parts.sql
```

Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260603000000_set_parts.sql
git commit -m "feat(db): add set_parts table for bag-level part cache"
```

---

### Task 2: Add SetPart type

**Files:**

- Modify: `packages/core/src/types/lego.ts`

- [ ] **Step 1: Add the interface** at the end of `packages/core/src/types/lego.ts`

```ts
export interface SetPart {
  partNum: string;
  partName: string;
  colorName: string;
  quantity: number;
  bagNum: number | null;
  imgUrl: string;
  isSpare: boolean;
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd packages/core && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types/lego.ts
git commit -m "feat(types): add SetPart interface"
```

---

### Task 3: fetchSetInventorySets — TDD

**Files:**

- Modify: `packages/core/src/services/rebrickable.ts`
- Modify: `packages/core/src/services/rebrickable.test.ts`

- [ ] **Step 1: Write the failing tests** — add a new `describe('fetchSetInventorySets')` block inside the existing `describe('Rebrickable Service')` in `packages/core/src/services/rebrickable.test.ts`:

```ts
import { searchRebrickable, findRebrickableByBarcode, findRebrickableItem, fetchSetInventorySets } from './rebrickable';
```

```ts
describe('fetchSetInventorySets', () => {
  it('returns bag set numbers when inventory sets exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        count: 2,
        next: null,
        results: [
          { set_num: '75313-B1', name: 'Bag 1', num_parts: 200, set_img_url: '' },
          { set_num: '75313-B2', name: 'Bag 2', num_parts: 150, set_img_url: '' },
        ],
      }),
    });
    const bags = await fetchSetInventorySets('75313-1');
    expect(bags).toEqual(['75313-B1', '75313-B2']);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sets/75313-1/sets/'));
  });

  it('returns empty array when no inventory sets exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 0, next: null, results: [] }),
    });
    expect(await fetchSetInventorySets('10305-1')).toEqual([]);
  });

  it('returns empty array when API key is missing', async () => {
    (getConfig as any).mockReturnValue({ rebrickableApiKey: null });
    expect(await fetchSetInventorySets('75313-1')).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty array on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    expect(await fetchSetInventorySets('75313-1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/services/rebrickable.test.ts
```

Expected: `fetchSetInventorySets` tests fail with "fetchSetInventorySets is not a function".

- [ ] **Step 3: Implement** — add to `packages/core/src/services/rebrickable.ts`:

```ts
interface RebrickableInventorySetsResponse {
  results: Array<{ set_num: string; name: string }>;
}

export async function fetchSetInventorySets(setNum: string): Promise<string[]> {
  const result = await fetchFromRebrickable<RebrickableInventorySetsResponse>(
    `/sets/${setNum}/sets/`,
    {}
  );
  return result?.results.map(s => s.set_num) ?? [];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/services/rebrickable.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/services/rebrickable.ts packages/core/src/services/rebrickable.test.ts
git commit -m "feat(rebrickable): add fetchSetInventorySets"
```

---

### Task 4: fetchPartsForInventory — TDD

**Files:**

- Modify: `packages/core/src/services/rebrickable.ts`
- Modify: `packages/core/src/services/rebrickable.test.ts`

- [ ] **Step 1: Update import in test file**

```ts
import {
  searchRebrickable,
  findRebrickableByBarcode,
  findRebrickableItem,
  fetchSetInventorySets,
  fetchPartsForInventory,
} from './rebrickable';
```

- [ ] **Step 2: Write the failing tests** — add a new `describe('fetchPartsForInventory')` block:

```ts
describe('fetchPartsForInventory', () => {
  it('maps API results to SetPart with given bagNum', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        count: 1,
        next: null,
        results: [
          {
            part: { part_num: '3001', name: 'Brick 2 x 4', part_img_url: 'https://cdn.rebrickable.com/3001.png' },
            color: { name: 'Red' },
            quantity: 2,
            is_spare: false,
          },
        ],
      }),
    });
    const parts = await fetchPartsForInventory('75313-B1', 1);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      partNum: '3001',
      partName: 'Brick 2 x 4',
      colorName: 'Red',
      quantity: 2,
      bagNum: 1,
      imgUrl: 'https://cdn.rebrickable.com/3001.png',
      isSpare: false,
    });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/sets/75313-B1/parts/'));
  });

  it('uses null bagNum when passed null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        count: 1,
        next: null,
        results: [
          {
            part: { part_num: '3001', name: 'Brick 2 x 4', part_img_url: '' },
            color: { name: 'Red' },
            quantity: 1,
            is_spare: true,
          },
        ],
      }),
    });
    const parts = await fetchPartsForInventory('10305-1', null);
    expect(parts[0].bagNum).toBeNull();
    expect(parts[0].isSpare).toBe(true);
  });

  it('follows pagination and concatenates results', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          count: 2,
          next: 'https://rebrickable.com/api/v3/lego/sets/75313-1/parts/?key=test-api-key&page=2',
          results: [
            {
              part: { part_num: '3001', name: 'Brick 2 x 4', part_img_url: '' },
              color: { name: 'Red' },
              quantity: 1,
              is_spare: false,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          count: 2,
          next: null,
          results: [
            {
              part: { part_num: '3002', name: 'Brick 1 x 4', part_img_url: '' },
              color: { name: 'Blue' },
              quantity: 3,
              is_spare: false,
            },
          ],
        }),
      });
    const parts = await fetchPartsForInventory('75313-1', null);
    expect(parts).toHaveLength(2);
    expect(parts[1].partNum).toBe('3002');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array when API key is missing', async () => {
    (getConfig as any).mockReturnValue({ rebrickableApiKey: null });
    expect(await fetchPartsForInventory('75313-1', 1)).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns partial results and stops on non-ok response mid-page', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          count: 2,
          next: 'https://rebrickable.com/api/v3/lego/sets/75313-1/parts/?page=2',
          results: [
            {
              part: { part_num: '3001', name: 'Brick 2 x 4', part_img_url: '' },
              color: { name: 'Red' },
              quantity: 1,
              is_spare: false,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } });
    const parts = await fetchPartsForInventory('75313-1', null);
    expect(parts).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/services/rebrickable.test.ts
```

Expected: `fetchPartsForInventory` tests fail with "fetchPartsForInventory is not a function".

- [ ] **Step 4: Add internal types and implement** — add to `packages/core/src/services/rebrickable.ts`:

```ts
interface RebrickablePartEntry {
  part: { part_num: string; name: string; part_img_url: string };
  color: { name: string };
  quantity: number;
  is_spare: boolean;
}

interface RebrickablePartsPage {
  count: number;
  next: string | null;
  results: RebrickablePartEntry[];
}
```

```ts
export async function fetchPartsForInventory(setNum: string, bagNum: number | null): Promise<SetPart[]> {
  const { rebrickableApiKey } = getConfig();
  if (!rebrickableApiKey) return [];

  const parts: SetPart[] = [];
  let url: string | null =
    `${BASE_URL}/sets/${setNum}/parts/?${new URLSearchParams({ key: rebrickableApiKey, page_size: '100' }).toString()}`;

  while (url) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError('Rate limit exceeded', retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      if (!response.ok) break;
      const page: RebrickablePartsPage = await response.json();
      for (const entry of page.results) {
        parts.push({
          partNum: entry.part.part_num,
          partName: entry.part.name,
          colorName: entry.color.name,
          quantity: entry.quantity,
          bagNum,
          imgUrl: entry.part.part_img_url ?? '',
          isSpare: entry.is_spare,
        });
      }
      url = page.next;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      break;
    }
  }

  return parts;
}
```

Also add the `SetPart` import at the top of `rebrickable.ts`:

```ts
import type { LegoCatalogItem, LegoItemType, SetPart } from '../types/lego';
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/services/rebrickable.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/rebrickable.ts packages/core/src/services/rebrickable.test.ts
git commit -m "feat(rebrickable): add fetchPartsForInventory with pagination"
```

---

### Task 5: getSetParts — TDD

**Files:**

- Modify: `packages/core/src/services/supabase.ts`
- Modify: `packages/core/src/services/supabase.test.ts`

- [ ] **Step 1: Update import in test file**

```ts
import {
  getCachedItemByBarcode,
  getCachedItem,
  cacheCatalogItem,
  syncCollectionToCloud,
  loadCollectionFromCloud,
  isSupabaseConfigured,
  getSetParts,
} from './supabase';
```

- [ ] **Step 2: Write the failing tests** — add a new `describe('getSetParts')` block in `packages/core/src/services/supabase.test.ts`:

```ts
const setPartRow = {
  id: 'uuid-1',
  set_id: 'set-75313',
  part_num: '3001',
  part_name: 'Brick 2 x 4',
  color_name: 'Red',
  quantity: 2,
  bag_num: 1,
  img_url: 'https://cdn.rebrickable.com/3001.png',
  is_spare: false,
};

describe('getSetParts', () => {
  it('returns mapped SetPart array from DB rows', async () => {
    makeMockClient({ data: [setPartRow], error: null });
    const parts = await getSetParts('set-75313');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({
      partNum: '3001',
      partName: 'Brick 2 x 4',
      colorName: 'Red',
      quantity: 2,
      bagNum: 1,
      imgUrl: 'https://cdn.rebrickable.com/3001.png',
      isSpare: false,
    });
  });

  it('returns empty array on DB error', async () => {
    makeMockClient({ data: null, error: { message: 'DB error' } });
    expect(await getSetParts('set-75313')).toEqual([]);
  });

  it('returns empty array when Supabase is not configured', async () => {
    (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
    expect(await getSetParts('set-75313')).toEqual([]);
  });

  it('maps null bag_num to null bagNum', async () => {
    makeMockClient({ data: [{ ...setPartRow, bag_num: null }], error: null });
    const parts = await getSetParts('set-75313');
    expect(parts[0].bagNum).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: `getSetParts` tests fail with "getSetParts is not a function".

- [ ] **Step 4: Implement** — add to `packages/core/src/services/supabase.ts`:

```ts
import type { LegoCatalogItem, OwnedLegoItem, SyncQueueEntry, SetPart } from '../types/lego';
```

```ts
function mapSetPartFromDb(row: Record<string, unknown>): SetPart {
  return {
    partNum: row.part_num as string,
    partName: row.part_name as string,
    colorName: row.color_name as string,
    quantity: row.quantity as number,
    bagNum: row.bag_num as number | null,
    imgUrl: row.img_url as string,
    isSpare: row.is_spare as boolean,
  };
}

export async function getSetParts(setId: string): Promise<SetPart[]> {
  const supabase = getClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('set_parts')
    .select('*')
    .eq('set_id', setId);

  if (error || !data) return [];
  return data.map(mapSetPartFromDb);
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/supabase.ts packages/core/src/services/supabase.test.ts
git commit -m "feat(supabase): add getSetParts"
```

---

### Task 6: cacheSetParts — TDD

**Files:**

- Modify: `packages/core/src/services/supabase.ts`
- Modify: `packages/core/src/services/supabase.test.ts`

- [ ] **Step 1: Update import in test file**

```ts
import {
  getCachedItemByBarcode,
  getCachedItem,
  cacheCatalogItem,
  syncCollectionToCloud,
  loadCollectionFromCloud,
  isSupabaseConfigured,
  getSetParts,
  cacheSetParts,
} from './supabase';
```

- [ ] **Step 2: Write the failing tests** — add a new `describe('cacheSetParts')` block:

```ts
const samplePart: import('../types/lego').SetPart = {
  partNum: '3001',
  partName: 'Brick 2 x 4',
  colorName: 'Red',
  quantity: 2,
  bagNum: 1,
  imgUrl: 'https://cdn.rebrickable.com/3001.png',
  isSpare: false,
};

describe('cacheSetParts', () => {
  it('calls upsert with mapped rows', async () => {
    const client = makeMockClient();
    await cacheSetParts('set-75313', [samplePart]);
    expect(client.upsert).toHaveBeenCalledWith(
      [
        {
          set_id: 'set-75313',
          part_num: '3001',
          part_name: 'Brick 2 x 4',
          color_name: 'Red',
          quantity: 2,
          bag_num: 1,
          img_url: 'https://cdn.rebrickable.com/3001.png',
          is_spare: false,
        },
      ],
      { onConflict: 'set_id,part_num,color_name', ignoreDuplicates: true }
    );
  });

  it('does nothing when parts array is empty', async () => {
    const client = makeMockClient();
    await cacheSetParts('set-75313', []);
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('does nothing when Supabase is not configured', async () => {
    (getConfig as any).mockReturnValue({ supabaseUrl: null, supabaseAnonKey: null });
    await expect(cacheSetParts('set-75313', [samplePart])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: `cacheSetParts` tests fail with "cacheSetParts is not a function".

- [ ] **Step 4: Implement** — add to `packages/core/src/services/supabase.ts`:

```ts
export async function cacheSetParts(setId: string, parts: SetPart[]): Promise<void> {
  const supabase = getClient();
  if (!supabase || parts.length === 0) return;

  const rows = parts.map(p => ({
    set_id: setId,
    part_num: p.partNum,
    part_name: p.partName,
    color_name: p.colorName,
    quantity: p.quantity,
    bag_num: p.bagNum,
    img_url: p.imgUrl,
    is_spare: p.isSpare,
  }));

  await supabase
    .from('set_parts')
    .upsert(rows, { onConflict: 'set_id,part_num,color_name', ignoreDuplicates: true });
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/core && npx vitest run src/services/supabase.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/services/supabase.ts packages/core/src/services/supabase.test.ts
git commit -m "feat(supabase): add cacheSetParts"
```

---

### Task 7: getOrFetchSetParts domain orchestrator — TDD

**Files:**

- Modify: `packages/core/src/domain/catalog.ts`
- Modify: `packages/core/src/domain/catalog.test.ts`

- [ ] **Step 1: Update mocks and imports in `catalog.test.ts`**

Add to the existing `vi.mock('../services/supabase', ...)` call:

```ts
vi.mock('../services/supabase', () => ({
  getCachedItemByBarcode: vi.fn(),
  cacheCatalogItem: vi.fn().mockResolvedValue(undefined),
  getCachedItem: vi.fn(),
  getSetParts: vi.fn(),
  cacheSetParts: vi.fn().mockResolvedValue(undefined),
}));
```

Add to the existing `vi.mock('../services/rebrickable', ...)` call:

```ts
vi.mock('../services/rebrickable', () => ({
  findRebrickableByBarcode: vi.fn(),
  searchRebrickable: vi.fn(),
  findRebrickableItem: vi.fn(),
  fetchSetInventorySets: vi.fn(),
  fetchPartsForInventory: vi.fn(),
}));
```

Add import:

```ts
import { getOrFetchSetParts } from './catalog';
import { getSetParts, cacheSetParts } from '../services/supabase';
import { fetchSetInventorySets, fetchPartsForInventory } from '../services/rebrickable';
```

- [ ] **Step 2: Write the failing tests** — add `describe('getOrFetchSetParts')` block in `catalog.test.ts`:

```ts
const setItem: import('../types/lego').LegoCatalogItem = {
  id: 'set-75313',
  type: 'set',
  number: '75313-1',
  name: 'AT-AT',
  theme: 'Star Wars',
  year: 2021,
  pieceCount: 6785,
  retired: false,
  estimatedValue: 849.99,
  imageUrl: '',
};

const part1: import('../types/lego').SetPart = {
  partNum: '3001', partName: 'Brick 2 x 4', colorName: 'Red',
  quantity: 2, bagNum: 1, imgUrl: '', isSpare: false,
};

describe('getOrFetchSetParts', () => {
  it('returns cached parts from Supabase without calling Rebrickable', async () => {
    (getSetParts as any).mockResolvedValueOnce([part1]);
    const result = await getOrFetchSetParts(setItem);
    expect(result).toEqual([part1]);
    expect(fetchSetInventorySets).not.toHaveBeenCalled();
    expect(fetchPartsForInventory).not.toHaveBeenCalled();
  });

  it('fetches from Rebrickable by bag when no cache, then caches result', async () => {
    (getSetParts as any).mockResolvedValueOnce([]);
    (fetchSetInventorySets as any).mockResolvedValueOnce(['75313-B1', '75313-B2']);
    (fetchPartsForInventory as any)
      .mockResolvedValueOnce([{ ...part1, bagNum: 1 }])
      .mockResolvedValueOnce([{ ...part1, partNum: '3002', bagNum: 2 }]);
    const result = await getOrFetchSetParts(setItem);
    expect(result).toHaveLength(2);
    expect(fetchPartsForInventory).toHaveBeenCalledWith('75313-B1', 1);
    expect(fetchPartsForInventory).toHaveBeenCalledWith('75313-B2', 2);
    expect(cacheSetParts).toHaveBeenCalledWith('set-75313', result);
  });

  it('fetches flat list when no bags exist, with bagNum null', async () => {
    (getSetParts as any).mockResolvedValueOnce([]);
    (fetchSetInventorySets as any).mockResolvedValueOnce([]);
    (fetchPartsForInventory as any).mockResolvedValueOnce([{ ...part1, bagNum: null }]);
    const result = await getOrFetchSetParts(setItem);
    expect(fetchPartsForInventory).toHaveBeenCalledWith('75313-1', null);
    expect(result[0].bagNum).toBeNull();
  });

  it('returns empty array for minifig items without calling any service', async () => {
    const minifig = { ...setItem, id: 'fig-sw001', type: 'minifig' as const };
    const result = await getOrFetchSetParts(minifig);
    expect(result).toEqual([]);
    expect(getSetParts).not.toHaveBeenCalled();
    expect(fetchSetInventorySets).not.toHaveBeenCalled();
  });

  it('returns empty array when fetch fails', async () => {
    (getSetParts as any).mockResolvedValueOnce([]);
    (fetchSetInventorySets as any).mockRejectedValueOnce(new Error('Network error'));
    const result = await getOrFetchSetParts(setItem);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd packages/core && npx vitest run src/domain/catalog.test.ts
```

Expected: `getOrFetchSetParts` tests fail with "getOrFetchSetParts is not a function".

- [ ] **Step 4: Implement** — add to `packages/core/src/domain/catalog.ts`:

```ts
import {
  getCachedItem,
  cacheCatalogItem,
  getCachedItemByBarcode,
  getSetParts,
  cacheSetParts,
} from '../services/supabase';
import {
  searchRebrickable,
  findRebrickableItem,
  findRebrickableByBarcode,
  fetchSetInventorySets,
  fetchPartsForInventory,
} from '../services/rebrickable';
```

```ts
export async function getOrFetchSetParts(item: LegoCatalogItem): Promise<SetPart[]> {
  if (item.type !== 'set') return [];

  try {
    const cached = await getSetParts(item.id);
    if (cached.length > 0) return cached;

    const bagSetNums = await fetchSetInventorySets(item.number);
    let parts: SetPart[];

    if (bagSetNums.length > 0) {
      const perBag = await Promise.all(
        bagSetNums.map((bagSetNum, i) => fetchPartsForInventory(bagSetNum, i + 1))
      );
      parts = perBag.flat();
    } else {
      parts = await fetchPartsForInventory(item.number, null);
    }

    cacheSetParts(item.id, parts).catch(() => {});
    return parts;
  } catch {
    return [];
  }
}
```

Also add `SetPart` to the import at the top of `catalog.ts`:

```ts
import type { LegoCatalogItem, LegoItemType, SetPart } from '../types/lego';
```

- [ ] **Step 5: Run all core tests to confirm no regressions**

```bash
cd packages/core && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/catalog.ts packages/core/src/domain/catalog.test.ts
git commit -m "feat(catalog): add getOrFetchSetParts orchestrator"
```

---

### Task 8: useSetParts hook

**Files:**

- Create: `apps/web/src/hooks/useSetParts.ts`

No test infrastructure for hooks in web app — covered by domain-level tests above and browser verify in Task 10.

- [ ] **Step 1: Create the hook**

```ts
// apps/web/src/hooks/useSetParts.ts
import { useState, useEffect } from 'react';
import { type LegoCatalogItem, type SetPart, getOrFetchSetParts } from '@anti-kragle/core';

export function useSetParts(item: LegoCatalogItem | undefined): {
  parts: SetPart[];
  loading: boolean;
  error: boolean;
} {
  const [parts, setParts] = useState<SetPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!item || item.type !== 'set') {
      setParts([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    getOrFetchSetParts(item)
      .then(result => {
        if (!cancelled) {
          setParts(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id]);

  return { parts, loading, error };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useSetParts.ts
git commit -m "feat(web): add useSetParts hook"
```

---

### Task 9: PartsList component

**Files:**

- Create: `apps/web/src/components/PartsList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/PartsList.tsx
import React from 'react';
import { type LegoCatalogItem, type SetPart } from '@anti-kragle/core';
import { useSetParts } from '../hooks/useSetParts';

export function PartsList({ item }: { item: LegoCatalogItem }) {
  const { parts, loading, error } = useSetParts(item);

  if (loading) {
    return <div className="parts-loading" data-testid="parts-loading">Loading parts…</div>;
  }
  if (error) {
    return <div className="parts-error" data-testid="parts-error">Couldn't load parts</div>;
  }
  if (parts.length === 0) return null;

  const nonSpares = parts.filter(p => !p.isSpare);
  const spares = parts.filter(p => p.isSpare);
  const hasNamedBags = nonSpares.some(p => p.bagNum !== null);

  const byBag = nonSpares.reduce<Record<string, SetPart[]>>((acc, part) => {
    const key = part.bagNum !== null ? String(part.bagNum) : 'all';
    (acc[key] ??= []).push(part);
    return acc;
  }, {});

  return (
    <section className="parts-list" data-testid="parts-list">
      <h3 className="parts-heading">Parts</h3>
      {hasNamedBags ? (
        Object.entries(byBag)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([bagKey, bagParts]) => (
            <details key={bagKey} className="parts-bag">
              <summary>Bag {bagKey} <span className="parts-count">({bagParts.length})</span></summary>
              <div className="parts-grid">
                {bagParts.map(p => (
                  <PartCard key={`${p.partNum}-${p.colorName}`} part={p} />
                ))}
              </div>
            </details>
          ))
      ) : (
        <>
          <p className="parts-count">{nonSpares.length} parts</p>
          <div className="parts-grid">
            {nonSpares.map(p => (
              <PartCard key={`${p.partNum}-${p.colorName}`} part={p} />
            ))}
          </div>
        </>
      )}
      {spares.length > 0 && (
        <details className="parts-bag parts-spares">
          <summary>Spare parts <span className="parts-count">({spares.length})</span></summary>
          <div className="parts-grid">
            {spares.map(p => (
              <PartCard key={`${p.partNum}-${p.colorName}`} part={p} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function PartCard({ part }: { part: SetPart }) {
  return (
    <div className="part-card" data-testid="part-card">
      <img
        src={part.imgUrl}
        alt={part.partName}
        className="part-img"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="part-num">{part.partNum}</span>
      <span className="part-color">{part.colorName}</span>
      <span className="part-qty">×{part.quantity}</span>
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
git add apps/web/src/components/PartsList.tsx
git commit -m "feat(web): add PartsList component"
```

---

### Task 10: Wire DetailPanel + browser verify

**Files:**

- Modify: `apps/web/src/components/DetailPanel.tsx`

- [ ] **Step 1: Add import** at the top of `DetailPanel.tsx`:

```ts
import { PartsList } from './PartsList';
```

- [ ] **Step 2: Add PartsList** at the bottom of the returned JSX, inside `<section className="detail-panel">`, after the `{ownedItem ? ... : ...}` block:

```tsx
{item.type === 'set' && <PartsList item={item} />}
```

The full section close should look like:

```tsx
    </section>
  );
}
```

So the final shape of the `return` in `DetailPanel`:

```tsx
  return (
    <section className="detail-panel">
      <div className="detail-hero">
        {/* ... existing hero content ... */}
      </div>

      {ownedItem ? (
        <form className="detail-form">
          {/* ... existing form fields ... */}
        </form>
      ) : (
        <div className="not-owned">
          {/* ... existing not-owned message ... */}
        </div>
      )}

      {item.type === 'set' && <PartsList item={item} />}
    </section>
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd packages/core && npx vitest run
cd apps/web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: `[checkpoint:human-verify]`** — Start the dev server and open a set detail panel:

```bash
cd apps/web && npm run dev
```

Open the app in the browser, search for a set (e.g. "75313" AT-AT), click it, and confirm:

- "Loading parts…" appears briefly
- Parts grouped by bag render below the owned-item form
- Each part shows thumbnail, part number, color, quantity
- Bags are collapsible via `<details>`
- Minifigs show no parts section

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/DetailPanel.tsx
git commit -m "feat(web): wire PartsList into DetailPanel for sets"
```
