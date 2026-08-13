import type { OwnedLegoItem } from '@anti-kragle/core';

// Exported so tests bind to the SUT's key rather than duplicating the literal.
// D8 of the provenance spec bumps this to .v2; with the literal duplicated in
// tests, the malformed-JSON and not-an-array cases would keep passing while
// reading a key nobody writes — green, and asserting nothing.
export const storageKey = 'brick-ledger.collection.v1';

const itemTypes = ['set', 'minifig'];
const collectionStatuses = ['collection', 'wishlist'];
const acquisitionQualities = [
  'new',
  'new-open-box',
  'used-with-box-instructions',
  'used-no-box',
  'used-no-instructions',
  'used-missing-parts',
];
const buildStatuses = ['not-started', 'in-progress', 'complete'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value);
}

function isOwnedLegoItem(item: unknown): item is OwnedLegoItem {
  if (!isObject(item)) {
    return false;
  }

  return (
    typeof item.id === 'string' &&
    isOneOf(item.type, itemTypes) &&
    typeof item.number === 'string' &&
    typeof item.name === 'string' &&
    typeof item.theme === 'string' &&
    typeof item.year === 'number' &&
    typeof item.pieceCount === 'number' &&
    typeof item.retired === 'boolean' &&
    typeof item.estimatedValue === 'number' &&
    typeof item.imageUrl === 'string' &&
    (typeof item.barcode === 'undefined' || typeof item.barcode === 'string') &&
    isOneOf(item.status, collectionStatuses) &&
    // Optional on the type, so optional here. Requiring it dropped every
    // wishlist item on load: `createOwnedItem` sets `acquiredQuality` only when
    // status is 'collection'. A present-but-invalid value is still rejected.
    (item.acquiredQuality === undefined ||
      isOneOf(item.acquiredQuality, acquisitionQualities)) &&
    typeof item.savedBox === 'boolean' &&
    isOneOf(item.buildStatus, buildStatuses) &&
    typeof item.displayLocation === 'string' &&
    typeof item.notes === 'string' &&
    typeof item.missingParts === 'string' &&
    (item.missingPartsList === undefined || Array.isArray(item.missingPartsList)) &&
    typeof item.quantity === 'number' &&
    typeof item.addedAt === 'string' &&
    typeof item.updatedAt === 'string'
  );
}

export function loadCollection(): OwnedLegoItem[] {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOwnedLegoItem) : [];
  } catch {
    return [];
  }
}

export function saveCollection(items: OwnedLegoItem[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(items));
}
