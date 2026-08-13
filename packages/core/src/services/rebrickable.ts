import type { LegoCatalogItem, LegoItemType, SetPart } from '../types/lego';
import { getConfig } from '../config';

const BASE_URL = 'https://rebrickable.com/api/v3/lego';

interface RebrickableItem {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string;
}

interface RebrickableResponse {
  results: RebrickableItem[];
}

export class RebrickableError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'RebrickableError';
  }
}

export class RateLimitError extends RebrickableError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

async function fetchFromRebrickable<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const { rebrickableApiKey } = getConfig();
  if (!rebrickableApiKey) {
    return null;
  }

  const searchParams = new URLSearchParams({
    ...params,
    key: rebrickableApiKey,
  });

  try {
    const response = await fetch(`${BASE_URL}${endpoint}?${searchParams.toString()}`);
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new RateLimitError('Rebrickable API rate limit exceeded', retryAfter ? parseInt(retryAfter, 10) : undefined);
    }
    if (!response.ok) {
      return null;
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    console.error('Rebrickable fetch error:', error);
    return null;
  }
}

function mapToCatalogItem(item: RebrickableItem, type: LegoItemType): LegoCatalogItem {
  return {
    id: `${type}-${item.set_num}`,
    type,
    number: item.set_num,
    name: item.name,
    theme: `Theme ${item.theme_id}`,
    year: item.year || 0,
    pieceCount: item.num_parts || 0,
    retired: false,
    estimatedValue: 0,
    // Empty, not a placeholder URL. This used to point at via.placeholder.com,
    // a service that no longer resolves, so the "fallback" rendered as a broken
    // image. Absence is signalled to the UI, which owns the placeholder.
    imageUrl: item.set_img_url || '',
  };
}

export async function searchRebrickable(query: string): Promise<LegoCatalogItem[]> {
  if (!query || query.length < 3) {
    return [];
  }

  try {
    const [sets, minifigs] = await Promise.all([
      fetchFromRebrickable<RebrickableResponse>('/sets/', { search: query, page_size: '10' }),
      fetchFromRebrickable<RebrickableResponse>('/minifigs/', { search: query, page_size: '5' }),
    ]);

    return [
      ...(sets?.results || []).map(s => mapToCatalogItem(s, 'set')),
      ...(minifigs?.results || []).map(m => mapToCatalogItem(m, 'minifig')),
    ];
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    return [];
  }
}

export async function findRebrickableByBarcode(barcode: string): Promise<LegoCatalogItem | null> {
  const cleanedBarcode = barcode.trim();
  
  try {
    // Try sets first
    const setResults = await fetchFromRebrickable<RebrickableResponse>('/sets/', { barcode: cleanedBarcode });
    if (setResults && setResults.results && setResults.results.length > 0) {
      return mapToCatalogItem(setResults.results[0], 'set');
    }

    // Fallback to minifigs
    const minifigResults = await fetchFromRebrickable<RebrickableResponse>('/minifigs/', { barcode: cleanedBarcode });
    if (minifigResults && minifigResults.results && minifigResults.results.length > 0) {
      return mapToCatalogItem(minifigResults.results[0], 'minifig');
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
  }

  return null;
}

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

export async function findRebrickableItem(number: string, type: LegoItemType): Promise<LegoCatalogItem | null> {
  const endpoint = type === 'set' ? `/sets/${number}/` : `/minifigs/${number}/`;

  try {
    const item = await fetchFromRebrickable<RebrickableItem>(endpoint, {});
    return item ? mapToCatalogItem(item, type) : null;
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    return null;
  }
}

/** What a Pick-a-Brick element id resolves to. */
export interface RebrickableElementInfo {
  elementId: string;
  partNum: string;
  name: string;
  colorName: string;
  imageUrl: string;
}

interface RebrickableElementResponse {
  element_id?: string;
  part?: { part_num: string; name: string; part_img_url: string | null };
  color?: { name: string };
}

/**
 * Resolve a LEGO element id (a mould in a specific colour) to its part name,
 * colour, and image.
 *
 * A Pick-a-Brick export contains nothing but element ids, so this is the only
 * way an imported part becomes recognisable. Returns null when the element is
 * unknown, which is expected: not every element LEGO sells is catalogued.
 */
export async function findRebrickableElement(elementId: string): Promise<RebrickableElementInfo | null> {
  const cleaned = elementId.trim();
  // The id is interpolated into the request path, so it is constrained to the
  // shape a real element id has rather than escaped after the fact.
  if (!/^[0-9a-zA-Z]{1,20}$/.test(cleaned)) return null;

  const data = await fetchFromRebrickable<RebrickableElementResponse>(`/elements/${cleaned}/`, {});
  if (!data?.part) return null;

  return {
    elementId: data.element_id ?? cleaned,
    partNum: data.part.part_num,
    name: data.part.name,
    colorName: data.color?.name ?? '',
    imageUrl: data.part.part_img_url ?? '',
  };
}

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
      const page = await response.json() as RebrickablePartsPage;
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
      // Validate next URL stays within Rebrickable before following
      url = page.next && page.next.startsWith('https://rebrickable.com/') ? page.next : null;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      break;
    }
  }

  return parts;
}
