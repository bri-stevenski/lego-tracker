# Plan: Parts List Export (CSV + BSX)

**Date:** 2026-06-04 | **Tasks:** 3 | **Time:** ~15 min

## Goal

From the PartsList view, clicking CSV or BSX downloads the full set's parts (or a single bag's parts) as a file.

## Observable Truths

1. `partsToCSV(parts)` returns a string with header `DesignNumber,ColorName,Quantity` and one row per part
2. `partsToBSX(parts)` returns valid XML with `<BrickStockXML><Inventory>` structure
3. The PartsList header has CSV + BSX buttons that download all non-spare parts
4. Each bag `<details>` has CSV + BSX buttons that download only that bag's parts
5. `partsToCSV([])` returns `''`; `partsToBSX([])` returns a valid empty document

## Uncertainties

- `[ASSUMPTION]` BSX uses `<ColorName>` (text) rather than numeric BrickLink color IDs — BrickStock accepts both
- `[ASSUMPTION]` Spare parts are included in the full-set export but not per-bag exports

## File Map

```text
CREATE  packages/core/src/domain/partsExport.ts
CREATE  packages/core/src/domain/partsExport.test.ts
MODIFY  packages/core/src/index.ts
MODIFY  apps/web/src/components/PartsList.tsx
```

---

## Tasks

### Task 1: Implement and test `partsToCSV` and `partsToBSX`

**Files:**

- Create: `packages/core/src/domain/partsExport.ts`
- Create: `packages/core/src/domain/partsExport.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/domain/partsExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { partsToCSV, partsToBSX } from './partsExport';
import type { SetPart } from '../types/lego';

const part1: SetPart = {
  partNum: '3001', partName: 'Brick 2x4', colorName: 'Red',
  quantity: 2, bagNum: 1, imgUrl: '', isSpare: false,
};
const part2: SetPart = {
  partNum: '3002', partName: 'Brick 1x4', colorName: 'Blue, Dark',
  quantity: 1, bagNum: 1, imgUrl: '', isSpare: false,
};

describe('partsToCSV', () => {
  it('returns empty string for no parts', () => {
    expect(partsToCSV([])).toBe('');
  });

  it('returns header + one row per part', () => {
    const csv = partsToCSV([part1]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('DesignNumber,ColorName,Quantity');
    expect(lines[1]).toBe('3001,Red,2');
  });

  it('quotes color names containing commas', () => {
    const csv = partsToCSV([part2]);
    expect(csv).toContain('"Blue, Dark"');
  });

  it('includes all parts', () => {
    const lines = partsToCSV([part1, part2]).split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});

describe('partsToBSX', () => {
  it('returns valid BSX wrapper for empty parts', () => {
    const bsx = partsToBSX([]);
    expect(bsx).toContain('<BrickStockXML>');
    expect(bsx).toContain('<Inventory>');
    expect(bsx).toContain('</BrickStockXML>');
  });

  it('includes an Item block per part', () => {
    const bsx = partsToBSX([part1]);
    expect(bsx).toContain('<ItemID>3001</ItemID>');
    expect(bsx).toContain('<ColorName>Red</ColorName>');
    expect(bsx).toContain('<Qty>2</Qty>');
    expect(bsx).toContain('<ItemType>P</ItemType>');
  });

  it('escapes XML special characters in part num and color', () => {
    const weirdPart: SetPart = {
      ...part1, partNum: '3001&1', colorName: 'Red<Dark>',
    };
    const bsx = partsToBSX([weirdPart]);
    expect(bsx).toContain('3001&amp;1');
    expect(bsx).toContain('Red&lt;Dark&gt;');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run packages/core/src/domain/partsExport.test.ts
```

Expected: fails with "Cannot find module './partsExport'".

- [ ] **Step 3: Implement `partsExport.ts`**

Create `packages/core/src/domain/partsExport.ts`:

```ts
import type { SetPart } from '../types/lego';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function partsToCSV(parts: SetPart[]): string {
  if (parts.length === 0) return '';
  const header = 'DesignNumber,ColorName,Quantity';
  const rows = parts.map(p => `${p.partNum},${csvEscape(p.colorName)},${p.quantity}`);
  return [header, ...rows].join('\n');
}

export function partsToBSX(parts: SetPart[]): string {
  const items = parts.map(p => `    <Item>
      <ItemType>P</ItemType>
      <ItemID>${xmlEscape(p.partNum)}</ItemID>
      <ColorName>${xmlEscape(p.colorName)}</ColorName>
      <Qty>${p.quantity}</Qty>
      <Condition>N</Condition>
    </Item>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<BrickStockXML>
  <Inventory>
${items}
  </Inventory>
</BrickStockXML>`;
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx vitest run packages/core/src/domain/partsExport.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
export * from './domain/partsExport';
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/partsExport.ts packages/core/src/domain/partsExport.test.ts packages/core/src/index.ts
git commit -m "feat(parts): partsToCSV and partsToBSX export functions"
```

---

### Task 2: Wire export buttons into PartsList

**Files:**

- Modify: `apps/web/src/components/PartsList.tsx`

- [ ] **Step 1: Add imports**

At the top of `apps/web/src/components/PartsList.tsx`, add to the existing import:

```ts
import { type LegoCatalogItem, type SetPart, partsToCSV, partsToBSX, downloadBlob } from '@anti-kragle/core';
```

- [ ] **Step 2: Replace the parts-list section with export-wired version**

Replace the full `return (...)` block in `PartsList`:

```tsx
return (
  <section className="parts-list" data-testid="parts-list">
    <div className="parts-list-header">
      <h3 className="parts-heading">Parts</h3>
      <div className="parts-export">
        <button
          type="button"
          className="text-button"
          data-testid="parts-export-csv"
          onClick={() => downloadBlob(partsToCSV([...nonSpares, ...spares]), `${item.number}-parts.csv`, 'text/csv')}
        >
          CSV
        </button>
        <button
          type="button"
          className="text-button"
          data-testid="parts-export-bsx"
          onClick={() => downloadBlob(partsToBSX([...nonSpares, ...spares]), `${item.number}-parts.bsx`, 'application/xml')}
        >
          BSX
        </button>
      </div>
    </div>
    {hasNamedBags ? (
      Object.entries(byBag)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([bagKey, bagParts]) => (
          <details key={bagKey} className="parts-bag">
            <summary>
              Bag {bagKey} <span className="parts-count">({bagParts.length})</span>
              <span className="parts-bag-export">
                <button
                  type="button"
                  className="text-button"
                  data-testid={`parts-bag-${bagKey}-export-csv`}
                  onClick={e => { e.preventDefault(); downloadBlob(partsToCSV(bagParts), `${item.number}-bag${bagKey}.csv`, 'text/csv'); }}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="text-button"
                  data-testid={`parts-bag-${bagKey}-export-bsx`}
                  onClick={e => { e.preventDefault(); downloadBlob(partsToBSX(bagParts), `${item.number}-bag${bagKey}.bsx`, 'application/xml'); }}
                >
                  BSX
                </button>
              </span>
            </summary>
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
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (126+).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PartsList.tsx
git commit -m "feat(parts): CSV and BSX export buttons — full set and per-bag"
```

---

### Task 3: Smoke test in browser and update roadmap

- [ ] **Step 1: Open the app and navigate to a set with parts**

Navigate to Lion Knights Castle (10305). The parts section has already loaded and been cached, so it appears immediately. Verify:

- "CSV" and "BSX" buttons appear in the parts header
- Clicking CSV downloads `10305-parts.csv` with the right columns
- Clicking BSX downloads `10305-parts.bsx` with valid XML

- [ ] **Step 2: Mark M5 complete in roadmap**

Update `docs/roadmap.md` — mark all three remaining M5 export tasks as `[x]` and set status to `done`.

- [ ] **Step 3: Commit and push**

```bash
git add docs/roadmap.md
git commit -m "chore(roadmap): mark M5 Pick-a-Brick export complete"
git push
```

---

## Summary

| Task | What | Time |
| --- | --- | --- |
| 1 | `partsToCSV` + `partsToBSX` pure functions with tests | 6 min |
| 2 | Export buttons in PartsList (header + per-bag) | 5 min |
| 3 | Browser smoke test + roadmap | 4 min |

**Total:** ~15 min
