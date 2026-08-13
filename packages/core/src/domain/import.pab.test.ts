import { describe, it, expect } from 'vitest';
import { detectCSVFormat, parseImportCSV, parsePickABrickCSV } from './import';

// The real shape of a Pick-a-Brick export, taken verbatim from
// `lego_pab_parts_moc-215480-forest-waterfall-diorama.csv`.
const pabHeader = 'elementId,quantity';

function pab(...rows: string[]): string {
  return [pabHeader, ...rows].join('\n');
}

const omgHeader = 'Set Number,Set Name,Year,Theme,Subtheme,Pieces,Minifigures,Quantity';

describe('detectCSVFormat', () => {
  it('recognises a Pick-a-Brick export by its header', () => {
    expect(detectCSVFormat(pab('6206150,2'))).toBe('pick-a-brick');
  });

  it('recognises an OMG Bricks export by its header', () => {
    expect(detectCSVFormat(`${omgHeader}\n10305,Lion Knights Castle,2022,Icons,Castle,4514,0,1`)).toBe(
      'omg-bricks',
    );
  });

  it('tolerates header spelling variants (spaces, case, quotes)', () => {
    expect(detectCSVFormat('"Element ID","Quantity"\n6206150,2')).toBe('pick-a-brick');
  });

  it('tolerates a UTF-8 BOM, which browser downloads often carry', () => {
    expect(detectCSVFormat(`﻿${pabHeader}\n6206150,2`)).toBe('pick-a-brick');
  });

  it('returns null for a format it does not know', () => {
    expect(detectCSVFormat('foo,bar,baz\n1,2,3')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(detectCSVFormat('')).toBeNull();
  });
});

describe('parsePickABrickCSV', () => {
  it('maps element id and quantity to their own fields', () => {
    // The original bug: quantity landed in `name` because the OMG Bricks
    // parser mapped column 1 to the set name.
    const [item] = parsePickABrickCSV(pab('6206150,2'));
    expect(item.number).toBe('6206150');
    expect(item.quantity).toBe(2);
    expect(item.name).not.toBe('2');
  });

  it('types every row as a part', () => {
    const items = parsePickABrickCSV(pab('6206150,2', '6182261,8'));
    expect(items.map((i) => i.type)).toEqual(['part', 'part']);
  });

  it('namespaces ids so a part cannot collide with a set of the same number', () => {
    const [item] = parsePickABrickCSV(pab('300426,1'));
    expect(item.id).toBe('part-300426');
  });

  it('gives a readable placeholder name before enrichment', () => {
    const [item] = parsePickABrickCSV(pab('6206150,2'));
    expect(item.name).toBe('Element 6206150');
  });

  it('defaults to the collection list', () => {
    const [item] = parsePickABrickCSV(pab('6206150,2'));
    expect(item.status).toBe('collection');
  });

  it('honours an explicit wishlist target', () => {
    const [item] = parsePickABrickCSV(pab('6206150,2'), { status: 'wishlist' });
    expect(item.status).toBe('wishlist');
  });

  it('omits acquiredQuality for wishlist rows, matching createOwnedItem', () => {
    // A present-but-meaningless acquiredQuality on a wishlist item is what the
    // storage validator rejects; see storage.ts isOwnedLegoItem.
    const [item] = parsePickABrickCSV(pab('6206150,2'), { status: 'wishlist' });
    expect(item.acquiredQuality).toBeUndefined();
  });

  it('clamps a missing or unparseable quantity to 1', () => {
    const [absent, junk] = parsePickABrickCSV(pab('6206150,', '6182261,abc'));
    expect(absent.quantity).toBe(1);
    expect(junk.quantity).toBe(1);
  });

  it('skips rows with no element id', () => {
    expect(parsePickABrickCSV(pab(',3', '6206150,2'))).toHaveLength(1);
  });

  it('sums duplicate element ids rather than emitting colliding ids', () => {
    const items = parsePickABrickCSV(pab('6206150,2', '6206150,3'));
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it('leaves imageUrl empty so the UI can supply its own fallback', () => {
    const [item] = parsePickABrickCSV(pab('6206150,2'));
    expect(item.imageUrl).toBe('');
  });

  it('returns an empty array for a header-only file', () => {
    expect(parsePickABrickCSV(pabHeader)).toEqual([]);
  });
});

describe('parseImportCSV', () => {
  it('routes a Pick-a-Brick file to the Pick-a-Brick parser', () => {
    const result = parseImportCSV(pab('6206150,2'));
    expect(result.format).toBe('pick-a-brick');
    expect(result.items[0].type).toBe('part');
  });

  it('routes an OMG Bricks file to the OMG Bricks parser', () => {
    const result = parseImportCSV(`${omgHeader}\n10305,Lion Knights Castle,2022,Icons,Castle,4514,0,1`);
    expect(result.format).toBe('omg-bricks');
    expect(result.items[0].name).toBe('Lion Knights Castle');
  });

  it('reports an unknown format instead of silently misparsing it', () => {
    // This is the whole bug: an unrecognised file used to be forced through the
    // OMG Bricks column layout, producing garbage rather than an error.
    const result = parseImportCSV('foo,bar,baz\n1,2,3');
    expect(result.format).toBeNull();
    expect(result.items).toEqual([]);
  });

  it('passes the target list through to whichever parser it picks', () => {
    const result = parseImportCSV(pab('6206150,2'), { status: 'wishlist' });
    expect(result.items[0].status).toBe('wishlist');

    const omg = parseImportCSV(`${omgHeader}\n10305,Castle,2022,Icons,Castle,4514,0,1`, {
      status: 'wishlist',
    });
    expect(omg.items[0].status).toBe('wishlist');
  });
});
