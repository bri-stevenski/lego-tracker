import { nowIso } from './clock';
import type { CollectionStatus, LegoItemType, OwnedLegoItem } from '../types/lego';

interface OmgBricksRow {
  setNumber: string;
  setName: string;
  year: number;
  theme: string;
  pieces: number;
  minifigures: number;
  quantity: number;
}

/** CSV layouts this app knows how to read. */
export type ImportFormat = 'omg-bricks' | 'pick-a-brick';

export interface ImportOptions {
  /** Which list the imported rows land in. Defaults to the collection. */
  status?: CollectionStatus;
}

export interface ImportResult {
  /** `null` when the header matched no known layout — see `parseImportCSV`. */
  format: ImportFormat | null;
  items: OwnedLegoItem[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function detectType(row: OmgBricksRow): LegoItemType {
  if (row.theme === 'Collectable Minifigures' && row.minifigures === 1 && row.pieces > 0 && row.pieces <= 20) {
    return 'minifig';
  }
  return 'set';
}

function generateId(row: OmgBricksRow, type: LegoItemType, hasDuplicate: boolean): string {
  const prefix = type === 'minifig' ? 'fig' : 'set';
  if (hasDuplicate || type === 'minifig') {
    return `${prefix}-${row.setNumber}-${slugify(row.setName)}`;
  }
  return `${prefix}-${row.setNumber}`;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Split into lines, dropping a UTF-8 BOM. Browser-downloaded CSVs frequently
 * carry one, and it would otherwise corrupt the first header cell and make
 * format detection fail on an otherwise valid file.
 */
function toLines(csvText: string): string[] {
  return csvText.replace(/^﻿/, '').trim().split(/\r?\n/).filter((l) => l.trim());
}

/** Reduce a header cell to comparable form: `"Element ID"` -> `elementid`. */
function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Identify a CSV layout from its header row.
 *
 * Every parser here maps columns by fixed position, so reading the header is
 * what makes that safe: without it, a file of any shape gets forced through one
 * layout's column indices and silently yields garbage (a Pick-a-Brick quantity
 * landing in the set-name column, for instance).
 */
export function detectCSVFormat(csvText: string): ImportFormat | null {
  const [headerLine] = toLines(csvText);
  if (!headerLine) return null;

  const cells = parseCSVLine(headerLine).map(normalizeHeaderCell);

  if (cells.includes('elementid') && cells.includes('quantity')) {
    return 'pick-a-brick';
  }
  if (cells.includes('setnumber')) {
    return 'omg-bricks';
  }
  return null;
}

/**
 * Fields every imported row shares, regardless of source layout.
 *
 * `acquiredQuality` is set only for collection rows, mirroring `createOwnedItem`:
 * it describes how something was acquired, which is meaningless for a wishlist
 * item, and a present-but-inapplicable value is what storage validation rejects.
 */
function ownedDefaults(status: CollectionStatus) {
  return {
    retired: false,
    estimatedValue: 0,
    imageUrl: '',
    status,
    ...(status === 'collection' ? { acquiredQuality: 'new' as const } : {}),
    buildStatus: 'not-started' as const,
    displayLocation: '',
    notes: '',
    missingParts: '',
    missingPartsList: [],
  };
}

export function parseOmgBricksCSV(csvText: string, options: ImportOptions = {}): OwnedLegoItem[] {
  const status = options.status ?? 'collection';
  const lines = toLines(csvText);
  if (lines.length < 2) return [];

  const rows: OmgBricksRow[] = lines.slice(1).map((line) => {
    const f = parseCSVLine(line);
    return {
      setNumber: f[0]?.trim() ?? '',
      setName: f[1]?.trim() ?? '',
      year: parseInt(f[2]?.trim() ?? '0', 10) || 0,
      theme: f[3]?.trim() ?? '',
      pieces: parseInt(f[5]?.trim() ?? '0', 10) || 0,
      minifigures: parseInt(f[6]?.trim() ?? '0', 10) || 0,
      quantity: Math.max(1, parseInt(f[7]?.trim() ?? '1', 10) || 1),
    };
  }).filter((r) => r.setNumber);

  const numberCounts = new Map<string, number>();
  for (const row of rows) {
    numberCounts.set(row.setNumber, (numberCounts.get(row.setNumber) ?? 0) + 1);
  }

  const now = nowIso();

  return rows.map((row) => {
    const type = detectType(row);
    const hasDuplicate = (numberCounts.get(row.setNumber) ?? 0) > 1;
    const id = generateId(row, type, hasDuplicate);

    return {
      ...ownedDefaults(status),
      id,
      type,
      number: row.setNumber,
      name: row.setName,
      theme: row.theme,
      year: row.year,
      pieceCount: row.pieces,
      savedBox: true,
      quantity: row.quantity,
      addedAt: now,
      updatedAt: now,
    } satisfies OwnedLegoItem;
  });
}

/**
 * Parse a LEGO Pick-a-Brick export: `elementId,quantity`.
 *
 * The file carries no name, colour, or image — only the element id — so rows
 * land with a readable placeholder name and an empty `imageUrl`. `enrichPartItems`
 * fills those in from Rebrickable afterwards, and the UI supplies a fallback
 * image for whatever stays unresolved.
 */
export function parsePickABrickCSV(csvText: string, options: ImportOptions = {}): OwnedLegoItem[] {
  const status = options.status ?? 'collection';
  const lines = toLines(csvText);
  if (lines.length < 2) return [];

  // The same element can legitimately appear on more than one row (one per
  // usage in the source model). Summing keeps the total honest and avoids
  // emitting two rows that would collide on `part-<elementId>`.
  const quantities = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const f = parseCSVLine(line);
    const elementId = f[0]?.trim() ?? '';
    if (!elementId) continue;

    const quantity = Math.max(1, parseInt(f[1]?.trim() ?? '1', 10) || 1);
    quantities.set(elementId, (quantities.get(elementId) ?? 0) + quantity);
  }

  const now = nowIso();

  return [...quantities].map(([elementId, quantity]) => ({
    ...ownedDefaults(status),
    id: `part-${elementId}`,
    type: 'part' as const,
    number: elementId,
    name: `Element ${elementId}`,
    theme: '',
    // An element has no release year; 0 is the schema's "unknown" value.
    year: 0,
    pieceCount: 1,
    savedBox: false,
    quantity,
    addedAt: now,
    updatedAt: now,
  } satisfies OwnedLegoItem));
}

/**
 * Read any supported CSV, choosing the parser from the file's own header.
 *
 * An unrecognised file yields `{ format: null, items: [] }` so the caller can
 * say so, rather than being run through an arbitrary layout and producing
 * plausible-looking nonsense.
 */
export function parseImportCSV(csvText: string, options: ImportOptions = {}): ImportResult {
  const format = detectCSVFormat(csvText);

  switch (format) {
    case 'pick-a-brick':
      return { format, items: parsePickABrickCSV(csvText, options) };
    case 'omg-bricks':
      return { format, items: parseOmgBricksCSV(csvText, options) };
    default:
      return { format: null, items: [] };
  }
}
