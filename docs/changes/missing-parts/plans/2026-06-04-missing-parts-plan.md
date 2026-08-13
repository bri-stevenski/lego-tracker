# Plan: Missing Parts List

**Date:** 2026-06-04 | **Tasks:** 4 | **Time:** ~25 min

## Goal

From a set's detail panel, the user can mark individual parts as missing, see a dedicated missing-parts list, and export it as CSV or BSX. Stored in `OwnedLegoItem.missingPartsList` alongside the rest of the collection in localStorage.

## Architecture

```text
DetailPanel
  ├── PartsList          — part cards now have a "mark missing" toggle (owned sets only)
  └── MissingPartsList   — shows missing parts, remove buttons, CSV/BSX export
```

## Observable Truths

1. Clicking a part card's missing toggle marks it missing; clicking again removes it
2. Missing parts appear in a "Missing Parts" section below the parts list
3. The missing parts section has CSV and BSX export buttons (reusing partsToCSV/partsToBSX)
4. Each missing part has a "Remove" button
5. Missing parts persist across page reloads (stored in localStorage with the collection)
6. Minifigs and unowned sets never show the missing-parts feature

## Uncertainties

- `[ASSUMPTION]` Per-step marking from instruction playback deferred — this feature covers manual marking only
- `[ASSUMPTION]` `missingPartsList` defaults to `[]` for items that predate this feature

## File Map

```text
MODIFY  packages/core/src/types/lego.ts              — add MissingSetPart; add missingPartsList to OwnedLegoItem
MODIFY  packages/core/src/domain/collection.ts       — add toggleMissingPart; init missingPartsList in createOwnedItem
MODIFY  packages/core/src/domain/collection.test.ts  — add tests for toggleMissingPart
MODIFY  packages/core/src/index.ts                   — export toggleMissingPart
MODIFY  apps/web/src/components/PartsList.tsx        — add missing toggle to PartCard
CREATE  apps/web/src/components/MissingPartsList.tsx — missing parts section
MODIFY  apps/web/src/components/DetailPanel.tsx      — wire in MissingPartsList + pass props to PartsList
MODIFY  apps/web/src/app/App.tsx                     — pass onToggleMissing to DetailPanel
MODIFY  apps/web/src/app/styles.css                  — missing parts styles
```

---

## Tasks

### Task 1: MissingSetPart type + toggleMissingPart + collection init

**Files:**

- Modify: `packages/core/src/types/lego.ts`
- Modify: `packages/core/src/domain/collection.ts`
- Modify: `packages/core/src/domain/collection.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add MissingSetPart and extend OwnedLegoItem**

In `packages/core/src/types/lego.ts`, add after `InstructionBooklet`:

```ts
export interface MissingSetPart {
  partNum: string;
  partName: string;
  colorName: string;
  quantity: number;
  imgUrl: string;
}
```

Add `missingPartsList: MissingSetPart[];` to `OwnedLegoItem`.

- [ ] **Step 2: Add failing tests for toggleMissingPart**

In `packages/core/src/domain/collection.test.ts`, update `makeOwned` to include `missingPartsList: []`, then append:

```ts
import { createOwnedItem, summarizeCollection, upsertOwnedItem, toggleMissingPart } from './collection';
import type { SetPart } from '../types/lego';

const basePart: SetPart = {
  partNum: '3001', partName: 'Brick 2x4', colorName: 'Red',
  quantity: 2, bagNum: null, imgUrl: 'https://img.example.com/3001.png', isSpare: false,
};

describe('toggleMissingPart', () => {
  it('adds a part to missingPartsList when not present', () => {
    const item = makeOwned('collection');
    const result = toggleMissingPart(item, basePart);
    expect(result.missingPartsList).toHaveLength(1);
    expect(result.missingPartsList[0].partNum).toBe('3001');
    expect(result.missingPartsList[0].quantity).toBe(2);
  });

  it('removes a part from missingPartsList when already present', () => {
    const item: OwnedLegoItem = {
      ...makeOwned('collection'),
      missingPartsList: [
        { partNum: '3001', partName: 'Brick 2x4', colorName: 'Red', quantity: 2, imgUrl: '' },
      ],
    };
    const result = toggleMissingPart(item, basePart);
    expect(result.missingPartsList).toHaveLength(0);
  });

  it('does not mutate the original item', () => {
    const item = makeOwned('collection');
    toggleMissingPart(item, basePart);
    expect(item.missingPartsList).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run packages/core/src/domain/collection.test.ts
```

Expected: fails with "toggleMissingPart is not a function".

- [ ] **Step 4: Implement toggleMissingPart and update createOwnedItem**

In `packages/core/src/domain/collection.ts`:

Add `import type { ... MissingSetPart, SetPart } from '../types/lego';` (extend the existing import).

Update `createOwnedItem` to include `missingPartsList: []` in the returned object.

Add the new function:

```ts
export function toggleMissingPart(item: OwnedLegoItem, part: SetPart): OwnedLegoItem {
  const key = `${part.partNum}:${part.colorName}`;
  const existing = item.missingPartsList ?? [];
  const alreadyMissing = existing.some(p => `${p.partNum}:${p.colorName}` === key);
  const missingPartsList: MissingSetPart[] = alreadyMissing
    ? existing.filter(p => `${p.partNum}:${p.colorName}` !== key)
    : [...existing, { partNum: part.partNum, partName: part.partName, colorName: part.colorName, quantity: part.quantity, imgUrl: part.imgUrl }];
  return { ...item, missingPartsList };
}
```

- [ ] **Step 5: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
// (toggleMissingPart is already exported via 'export * from ./domain/collection')
```

Verify `toggleMissingPart` is exported by checking that `export * from './domain/collection'` is present.

- [ ] **Step 6: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (138+).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types/lego.ts packages/core/src/domain/collection.ts packages/core/src/domain/collection.test.ts
git commit -m "feat(missing-parts): MissingSetPart type + toggleMissingPart + OwnedLegoItem.missingPartsList"
```

---

### Task 2: PartsList missing toggle + MissingPartsList component

**Files:**

- Modify: `apps/web/src/components/PartsList.tsx`
- Create: `apps/web/src/components/MissingPartsList.tsx`
- Modify: `apps/web/src/app/styles.css`

- [ ] **Step 1: Update PartsList to accept missing-parts props**

Update the `PartsList` function signature and `PartCard` in `apps/web/src/components/PartsList.tsx`:

```tsx
export function PartsList({
  item,
  missingKeys,
  onToggleMissing,
}: {
  item: LegoCatalogItem;
  missingKeys?: Set<string>;
  onToggleMissing?: (part: SetPart) => void;
}) {
```

Update each call to `<PartCard>` to pass through the props:

```tsx
<PartCard
  key={`${p.partNum}-${p.colorName}`}
  part={p}
  isMissing={missingKeys?.has(`${p.partNum}:${p.colorName}`) ?? false}
  onToggle={onToggleMissing}
/>
```

Update `PartCard`:

```tsx
function PartCard({
  part,
  isMissing,
  onToggle,
}: {
  part: SetPart;
  isMissing?: boolean;
  onToggle?: (part: SetPart) => void;
}) {
  return (
    <div
      className={`part-card${isMissing ? ' part-card--missing' : ''}`}
      data-testid="part-card"
    >
      <img
        src={part.imgUrl}
        alt={part.partName}
        className="part-img"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="part-num">{part.partNum}</span>
      <span className="part-color">{part.colorName}</span>
      <span className="part-qty">×{part.quantity}</span>
      {onToggle && (
        <button
          type="button"
          className={`part-missing-btn${isMissing ? ' part-missing-btn--active' : ''}`}
          title={isMissing ? 'Remove from missing' : 'Mark as missing'}
          onClick={() => onToggle(part)}
          data-testid={`part-missing-${part.partNum}`}
        >
          {isMissing ? '✓' : '!'}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MissingPartsList component**

Create `apps/web/src/components/MissingPartsList.tsx`:

```tsx
import React from 'react';
import { Trash2 } from 'lucide-react';
import { type MissingSetPart, partsToCSV, partsToBSX, downloadBlob } from '@anti-kragle/core';

export function MissingPartsList({
  parts,
  setNumber,
  onRemove,
}: {
  parts: MissingSetPart[];
  setNumber: string;
  onRemove: (partNum: string, colorName: string) => void;
}) {
  if (parts.length === 0) return null;

  const asParts = parts.map(p => ({
    ...p, bagNum: null, isSpare: false,
  }));

  return (
    <section className="missing-parts-section" data-testid="missing-parts-section">
      <div className="parts-list-header">
        <h3 className="parts-heading">Missing Parts <span className="parts-count">({parts.length})</span></h3>
        <div className="parts-export">
          <button
            type="button"
            className="text-button"
            data-testid="missing-export-csv"
            onClick={() => downloadBlob(partsToCSV(asParts), `${setNumber}-missing.csv`, 'text/csv')}
          >
            CSV
          </button>
          <button
            type="button"
            className="text-button"
            data-testid="missing-export-bsx"
            onClick={() => downloadBlob(partsToBSX(asParts), `${setNumber}-missing.bsx`, 'application/xml')}
          >
            BSX
          </button>
        </div>
      </div>
      <div className="missing-parts-list">
        {parts.map(p => (
          <div
            key={`${p.partNum}:${p.colorName}`}
            className="missing-part-row"
            data-testid="missing-part-row"
          >
            <img
              src={p.imgUrl}
              alt={p.partName}
              className="missing-part-img"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="missing-part-info">
              <span className="part-num">{p.partNum}</span>
              <span className="part-color">{p.colorName}</span>
            </div>
            <span className="part-qty">×{p.quantity}</span>
            <button
              type="button"
              className="text-button missing-remove-btn"
              title="Remove from missing list"
              onClick={() => onRemove(p.partNum, p.colorName)}
              data-testid={`missing-remove-${p.partNum}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add CSS**

Add to `apps/web/src/app/styles.css` after the instructions section:

```css
/* ─── Missing parts ───────────────────────────────────── */

.missing-parts-section {
  border-top: 1px solid var(--color-border-light);
  margin-top: 32px;
  padding-top: 24px;
}

.missing-parts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.missing-part-row {
  align-items: center;
  background: rgba(201, 47, 47, 0.05);
  border: 1px solid rgba(201, 47, 47, 0.15);
  border-radius: 8px;
  display: flex;
  gap: 10px;
  padding: 8px 12px;
}

.missing-part-img {
  border-radius: 4px;
  height: 36px;
  object-fit: contain;
  width: 36px;
}

.missing-part-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.missing-remove-btn {
  color: var(--color-text-subtle);
  flex-shrink: 0;
}

.missing-remove-btn:hover { color: var(--color-accent); }

/* Mark missing toggle on part cards */
.part-card--missing {
  border-color: rgba(201, 47, 47, 0.4);
  opacity: 0.75;
}

.part-missing-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-subtle);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  min-height: auto;
  padding: 2px 4px;
  width: 100%;
}

.part-missing-btn:hover {
  background: transparent;
  border-color: var(--color-accent);
  box-shadow: none;
  color: var(--color-accent);
  transform: none;
}

.part-missing-btn--active {
  background: rgba(201, 47, 47, 0.1);
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

- [ ] **Step 4: Wire into DetailPanel**

Update `DetailPanel` to accept `onToggleMissing` prop:

Add to the props interface:

```ts
onToggleMissing: (part: SetPart) => void;
```

Add import at top:

```ts
import { MissingPartsList } from './MissingPartsList';
import type { SetPart } from '@anti-kragle/core';
```

Replace the PartsList render:

```tsx
{item.type === 'set' && (
  <PartsList
    item={item}
    missingKeys={ownedItem ? new Set((ownedItem.missingPartsList ?? []).map(p => `${p.partNum}:${p.colorName}`)) : undefined}
    onToggleMissing={ownedItem ? onToggleMissing : undefined}
  />
)}
{item.type === 'set' && ownedItem && (
  <MissingPartsList
    parts={ownedItem.missingPartsList ?? []}
    setNumber={item.number}
    onRemove={(partNum, colorName) =>
      onToggleMissing({ partNum, colorName, partName: '', quantity: 1, bagNum: null, imgUrl: '', isSpare: false })
    }
  />
)}
```

- [ ] **Step 5: Update App.tsx to pass onToggleMissing**

In `App.tsx`, import `toggleMissingPart` from `@anti-kragle/core`.

Add a handler inside `App`:

```ts
function handleToggleMissing(part: SetPart) {
  if (!selectedOwnedItem) return;
  const updated = toggleMissingPart(selectedOwnedItem, part);
  updateSelectedItem({ missingPartsList: updated.missingPartsList });
}
```

Pass to `DetailPanel`:

```tsx
onToggleMissing={handleToggleMissing}
```

- [ ] **Step 6: TypeScript + test suite check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json && npx vitest run
```

Expected: no TypeScript errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/PartsList.tsx apps/web/src/components/MissingPartsList.tsx apps/web/src/components/DetailPanel.tsx apps/web/src/app/App.tsx apps/web/src/app/styles.css
git commit -m "feat(missing-parts): mark parts missing from PartsList, MissingPartsList with CSV/BSX export"
```

---

### Task 3: Smoke test + roadmap

- [ ] **Step 1: Open the app and mark parts as missing**

Navigate to Lion Knights Castle (owned). In the parts list, click the "!" button on a few part cards. Verify:

- Part card gets red border and "✓" indicator
- Missing parts appear in the "Missing Parts" section below
- CSV and BSX export buttons appear in the missing parts header

- [ ] **Step 2: Verify persistence**

Reload the page. The missing parts should still be there (localStorage persisted).

- [ ] **Step 3: Update roadmap and push**

```bash
git add docs/roadmap.md
git commit -m "chore(roadmap): mark M6 Missing Parts complete"
git push
```

---

## Summary

| Task | What | Time |
| --- | --- | --- |
| 1 | Type + toggleMissingPart + tests | 7 min |
| 2 | PartsList toggle + MissingPartsList + DetailPanel wiring + CSS | 12 min |
| 3 | Smoke test + roadmap | 4 min |

**Total:** ~23 min
