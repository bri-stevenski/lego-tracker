import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichPartItems } from './enrich';
import { findRebrickableElement } from '../services/rebrickable';
import type { OwnedLegoItem } from '../types/lego';

vi.mock('../services/rebrickable', () => ({
  findRebrickableElement: vi.fn(),
}));

const lookup = vi.mocked(findRebrickableElement);

function partItem(number: string, overrides: Partial<OwnedLegoItem> = {}): OwnedLegoItem {
  return {
    id: `part-${number}`,
    type: 'part',
    number,
    name: `Element ${number}`,
    theme: '',
    year: 0,
    pieceCount: 1,
    retired: false,
    estimatedValue: 0,
    imageUrl: '',
    status: 'wishlist',
    savedBox: false,
    buildStatus: 'not-started',
    displayLocation: '',
    notes: '',
    missingParts: '',
    missingPartsList: [],
    quantity: 1,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  lookup.mockReset();
});

describe('enrichPartItems', () => {
  it('fills in name, colour and image from the element lookup', async () => {
    lookup.mockResolvedValue({
      elementId: '6206150',
      partNum: '3023',
      name: 'Plate 1 x 2',
      colorName: 'Dark Bluish Gray',
      imageUrl: 'https://cdn.rebrickable.com/media/parts/3023.png',
    });

    const [item] = await enrichPartItems([partItem('6206150')]);

    expect(item.name).toBe('Plate 1 x 2');
    expect(item.theme).toBe('Dark Bluish Gray');
    expect(item.imageUrl).toBe('https://cdn.rebrickable.com/media/parts/3023.png');
  });

  it('preserves the fields the lookup has no business changing', async () => {
    lookup.mockResolvedValue({
      elementId: '6206150',
      partNum: '3023',
      name: 'Plate 1 x 2',
      colorName: 'Dark Bluish Gray',
      imageUrl: 'https://cdn.rebrickable.com/media/parts/3023.png',
    });

    const [item] = await enrichPartItems([partItem('6206150', { quantity: 7, status: 'wishlist' })]);

    expect(item.quantity).toBe(7);
    expect(item.status).toBe('wishlist');
    expect(item.id).toBe('part-6206150');
  });

  it('leaves the bare item intact when the element is unknown', async () => {
    lookup.mockResolvedValue(null);

    const [item] = await enrichPartItems([partItem('9999999')]);

    expect(item.name).toBe('Element 9999999');
    expect(item.imageUrl).toBe('');
  });

  it('leaves the bare item intact when the lookup throws', async () => {
    // A rate limit or a dropped connection must not lose the import.
    lookup.mockRejectedValue(new Error('rate limited'));

    const [item] = await enrichPartItems([partItem('6206150')]);

    expect(item.name).toBe('Element 6206150');
  });

  it('never looks up a non-part item', async () => {
    const set = partItem('10305', { type: 'set', name: 'Lion Knights Castle' });

    const [item] = await enrichPartItems([set]);

    expect(lookup).not.toHaveBeenCalled();
    expect(item.name).toBe('Lion Knights Castle');
  });

  it('looks up each distinct element exactly once', async () => {
    lookup.mockResolvedValue({
      elementId: '6206150',
      partNum: '3023',
      name: 'Plate 1 x 2',
      colorName: 'Dark Bluish Gray',
      imageUrl: 'https://cdn.rebrickable.com/media/parts/3023.png',
    });

    await enrichPartItems([partItem('6206150'), partItem('6206150')]);

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('reports progress so a 150-row import can show a counter', async () => {
    lookup.mockResolvedValue(null);
    const seen: number[] = [];

    await enrichPartItems([partItem('1'), partItem('2'), partItem('3')], {
      onProgress: (done, total) => {
        seen.push(done);
        expect(total).toBe(3);
      },
    });

    expect(seen).toEqual([1, 2, 3]);
  });

  it('caps how many lookups are in flight at once', async () => {
    let inFlight = 0;
    let peak = 0;
    lookup.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return null;
    });

    const items = Array.from({ length: 20 }, (_, i) => partItem(String(i)));
    await enrichPartItems(items, { concurrency: 4 });

    expect(peak).toBeLessThanOrEqual(4);
  });

  it('returns items in their original order', async () => {
    lookup.mockResolvedValue(null);
    const items = [partItem('a'), partItem('b'), partItem('c')];

    const result = await enrichPartItems(items);

    expect(result.map((i) => i.number)).toEqual(['a', 'b', 'c']);
  });
});
