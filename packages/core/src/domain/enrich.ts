import { findRebrickableElement } from '../services/rebrickable';
import type { OwnedLegoItem } from '../types/lego';

export interface EnrichOptions {
  /** How many lookups may be in flight at once. */
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Resolve imported parts to real names, colours, and images.
 *
 * A Pick-a-Brick CSV carries only element ids, so a freshly imported part is a
 * bare number until this runs. Enrichment is best-effort by design: an unknown
 * element or a failed request leaves that item exactly as it was, because
 * losing an import to a rate limit would be far worse than showing a
 * placeholder. Non-part items are returned untouched.
 */
export async function enrichPartItems(
  items: OwnedLegoItem[],
  options: EnrichOptions = {},
): Promise<OwnedLegoItem[]> {
  const { concurrency = 4, onProgress } = options;

  // Lookups are keyed by element id, not by item, so an element used on several
  // rows costs one request rather than one per row.
  const elementIds = [...new Set(items.filter((i) => i.type === 'part').map((i) => i.number))];
  if (elementIds.length === 0) return items;

  const resolved = new Map<string, Awaited<ReturnType<typeof findRebrickableElement>>>();
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (cursor < elementIds.length) {
      const elementId = elementIds[cursor++];
      try {
        const info = await findRebrickableElement(elementId);
        if (info) resolved.set(elementId, info);
      } catch {
        // Rate limit or network failure. The item keeps its placeholder name
        // and the UI supplies a fallback image.
      }
      done += 1;
      onProgress?.(done, elementIds.length);
    }
  }

  const workers = Math.max(1, Math.min(concurrency, elementIds.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return items.map((item) => {
    const info = item.type === 'part' ? resolved.get(item.number) : undefined;
    if (!info) return item;

    return {
      ...item,
      name: info.name || item.name,
      // Parts have no theme; the colour is the useful thing to show in that slot.
      theme: info.colorName || item.theme,
      imageUrl: info.imageUrl || item.imageUrl,
    };
  });
}
