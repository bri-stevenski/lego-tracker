import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemList } from './ItemList';
import type { OwnedLegoItem, MissingSetPart } from '@anti-kragle/core';

function makeOwned(id: string, missingPartsList: MissingSetPart[] = []): OwnedLegoItem {
  return {
    id,
    type: 'set',
    number: id,
    name: `Set ${id}`,
    theme: 'Icons',
    year: 2024,
    pieceCount: 100,
    retired: false,
    estimatedValue: 50,
    imageUrl: 'https://example.test/img.png',
    status: 'collection',
    acquiredQuality: 'new',
    savedBox: true,
    buildStatus: 'not-started',
    displayLocation: '',
    notes: '',
    missingParts: '',
    missingPartsList,
    quantity: 1,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const part = (partNum: string, quantity: number): MissingSetPart => ({
  partNum,
  partName: `Part ${partNum}`,
  colorName: 'Red',
  quantity,
  imgUrl: '',
});

function renderList(ownedItems: OwnedLegoItem[]) {
  return render(
    <ItemList
      activeView="collection"
      catalogItems={[]}
      ownedItems={ownedItems}
      onSelect={vi.fn()}
      onAdd={vi.fn()}
    />,
  );
}

describe('ItemList missing-parts badge', () => {
  it('shows a badge on a set that has missing parts', () => {
    renderList([makeOwned('10305', [part('3001', 1)])]);

    expect(screen.getByTestId('missing-badge-10305')).toBeInTheDocument();
  });

  it('shows no badge on a complete set', () => {
    renderList([makeOwned('10305', [])]);

    expect(screen.queryByTestId('missing-badge-10305')).not.toBeInTheDocument();
  });

  it('shows no badge when missingPartsList is absent entirely', () => {
    // Records loaded before the M6 migration have no `missingPartsList` at all.
    // The badge must not render `undefined` or crash on them.
    const legacy = makeOwned('10305');
    delete (legacy as Partial<OwnedLegoItem>).missingPartsList;

    renderList([legacy]);

    expect(screen.queryByTestId('missing-badge-10305')).not.toBeInTheDocument();
  });

  it('counts distinct parts, not total quantity', () => {
    // Two entries of 3 each is "2 parts missing", not 6. The user is reordering
    // distinct elements, and the badge has to agree with the list it links to.
    renderList([makeOwned('10305', [part('3001', 3), part('3002', 3)])]);

    expect(screen.getByTestId('missing-badge-10305')).toHaveTextContent('2');
  });

  it('labels the badge for screen readers rather than relying on the glyph', () => {
    renderList([makeOwned('10305', [part('3001', 1)])]);

    expect(screen.getByTestId('missing-badge-10305')).toHaveAttribute(
      'title',
      expect.stringContaining('missing'),
    );
  });

  it('badges only the sets that need it', () => {
    renderList([
      makeOwned('10305', [part('3001', 1)]),
      makeOwned('75192', []),
      makeOwned('21318', [part('3002', 2)]),
    ]);

    expect(screen.getByTestId('missing-badge-10305')).toBeInTheDocument();
    expect(screen.queryByTestId('missing-badge-75192')).not.toBeInTheDocument();
    expect(screen.getByTestId('missing-badge-21318')).toBeInTheDocument();
  });

  it('does not badge catalog rows, which have no ownership data', () => {
    render(
      <ItemList
        activeView="catalog"
        catalogItems={[makeOwned('10305', [part('3001', 1)])]}
        ownedItems={[]}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('missing-badge-10305')).not.toBeInTheDocument();
  });
});
