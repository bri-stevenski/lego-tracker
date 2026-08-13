import { describe, it, expect, beforeEach } from 'vitest';
import { loadCollection, saveCollection, storageKey } from './storage';
import { createOwnedItem } from '@anti-kragle/core';
import type { LegoCatalogItem, OwnedLegoItem } from '@anti-kragle/core';

const catalogItem: LegoCatalogItem = {
  id: 'set-21318', type: 'set', number: '21318',
  name: 'Tree House', theme: 'Ideas', year: 2019,
  pieceCount: 3036, retired: true, estimatedValue: 249.99,
  imageUrl: 'https://images.brickset.com/sets/images/21318-1.jpg',
};

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

  // The product was renamed "Brick Ledger" -> "Anti-Kragle", but this key was
  // deliberately NOT renamed: it addresses collections already sitting in real
  // browsers. Rewriting it orphans every existing user's data with no error and
  // no failing test -- every other case here binds to the symbol, so a global
  // find-and-replace would sail through green. This is the only assertion that
  // stands between a rename sweep and silent data loss. Change it only
  // alongside a migration that reads the old key.
  it('pins the persisted key to its legacy value across product renames', () => {
    expect(storageKey).toBe('brick-ledger.collection.v1');
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
        storageKey,
        JSON.stringify([baseItem, { id: 'bad', type: 'unknown' }]),
      );
      expect(loadCollection()).toHaveLength(1);
    });

    // Regression: `acquiredQuality` is optional on OwnedLegoItem, and
    // `createOwnedItem` omits it entirely for wishlist items — but the validator
    // required it, so every wishlist item was silently dropped on reload. Built
    // through the real factory rather than a literal: the bug lives in the seam
    // between what core produces and what storage accepts, and a hand-written
    // fixture would have kept passing while production lost data.
    it('round-trips a wishlist item, which carries no acquiredQuality', () => {
      const wishlistItem = createOwnedItem(catalogItem, 'wishlist');
      expect(wishlistItem.acquiredQuality).toBeUndefined();

      saveCollection([wishlistItem]);

      expect(loadCollection()).toHaveLength(1);
      expect(loadCollection()[0].status).toBe('wishlist');
    });

    it('still rejects an acquiredQuality that is present but not a valid quality', () => {
      localStorage.setItem(
        storageKey,
        JSON.stringify([{ ...baseItem, acquiredQuality: 'pristine' }]),
      );
      expect(loadCollection()).toEqual([]);
    });

    it('returns empty array on malformed JSON', () => {
      localStorage.setItem(storageKey, '{not valid json');
      expect(loadCollection()).toEqual([]);
    });

    it('returns empty array when stored value is not an array', () => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ id: 'not-array' }),
      );
      expect(loadCollection()).toEqual([]);
    });
  });

  // SEC-R002: missingPartsList must be validated to prevent tampered localStorage
  describe('missingPartsList field validation', () => {
    it('accepts an item with a valid missingPartsList array', () => {
      const item = { ...baseItem, missingPartsList: [{ partNum: '3001', partName: 'Brick', colorName: 'Red', quantity: 1, imgUrl: '' }] };
      localStorage.setItem(storageKey, JSON.stringify([item]));
      expect(loadCollection()).toHaveLength(1);
    });

    it('accepts an item with an empty missingPartsList array', () => {
      localStorage.setItem(storageKey, JSON.stringify([{ ...baseItem, missingPartsList: [] }]));
      expect(loadCollection()).toHaveLength(1);
    });

    it('accepts an item without a missingPartsList field (undefined)', () => {
      localStorage.setItem(storageKey, JSON.stringify([baseItem]));
      expect(loadCollection()).toHaveLength(1);
    });

    it('rejects an item where missingPartsList is a string', () => {
      const tampered = JSON.stringify([{ ...baseItem, missingPartsList: 'injected-string' }]);
      localStorage.setItem(storageKey, tampered);
      expect(loadCollection()).toHaveLength(0);
    });

    it('rejects an item where missingPartsList is a number', () => {
      const tampered = JSON.stringify([{ ...baseItem, missingPartsList: 42 }]);
      localStorage.setItem(storageKey, tampered);
      expect(loadCollection()).toHaveLength(0);
    });

    it('rejects an item where missingPartsList is an object (not array)', () => {
      const tampered = JSON.stringify([{ ...baseItem, missingPartsList: { partNum: '3001' } }]);
      localStorage.setItem(storageKey, tampered);
      expect(loadCollection()).toHaveLength(0);
    });
  });

  describe('saveCollection', () => {
    it('writes items to localStorage under the correct key', () => {
      saveCollection([baseItem]);
      const raw = localStorage.getItem(storageKey);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toHaveLength(1);
    });

    it('round-trips items through save + load', () => {
      saveCollection([baseItem]);
      expect(loadCollection()[0]).toEqual(baseItem);
    });
  });
});
