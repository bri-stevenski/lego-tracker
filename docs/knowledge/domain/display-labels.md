---
type: business_concept
domain: domain
tags: [labels, options, enums]
related: [options.ts, domain]
---

# Display Labels and Options

The options module in `packages/core/src/domain/options.ts` maps enum types to human-readable labels for UI display.

## itemTypeLabels

`itemTypeLabels` maps `LegoItemType` to display strings: `'set'` → `'Set'`, `'minifig'` → `'Minifig'`, `'part'` → `'Part'`. Used in `ItemList` and `DetailPanel` in `apps/web/src/app/App.tsx`.

## statusLabels

`statusLabels` maps `CollectionStatus` to display strings: `'collection'` → `'Collection'`, `'wishlist'` → `'Wishlist'`. Used in the List select dropdown in `DetailPanel`.

## qualityLabels

`qualityLabels` maps `AcquisitionQuality` to display strings: `'new'` → `'New'`, `'new-open-box'` → `'New, open box'`, `'used-with-box-instructions'` → `'Used with box/instructions'`, `'used-no-box'` → `'Used with no box'`, `'used-no-instructions'` → `'Used with no instructions'`, `'used-missing-parts'` → `'Used with missing parts'`. Used in the quality select dropdown in `DetailPanel`.

## buildStatusLabels

`buildStatusLabels` maps `BuildStatus` to display strings: `'not-started'` → `'Not started'`, `'in-progress'` → `'In progress'`, `'complete'` → `'Complete'`. Used in the building status select dropdown in `DetailPanel`.
