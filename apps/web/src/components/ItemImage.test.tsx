import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemImage } from './ItemImage';

describe('ItemImage', () => {
  it('renders the image when a url is present', () => {
    render(<ItemImage src="https://example.test/img.png" alt="Lion Knights Castle" type="set" />);

    const img = screen.getByAltText('Lion Knights Castle');
    expect(img).toHaveAttribute('src', 'https://example.test/img.png');
    expect(screen.queryByTestId('image-fallback')).toBeNull();
  });

  it('renders a fallback instead of a broken image when the url is empty', () => {
    // Imported Pick-a-Brick parts start with no image; an empty src renders as
    // the browser's broken-image glyph, which is what was reported.
    const { container } = render(<ItemImage src="" alt="Element 6206150" type="part" />);

    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
    // No <img> at all — an <img src=""> is exactly what draws the broken glyph.
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders a fallback when the url is only whitespace', () => {
    render(<ItemImage src="   " alt="Element 6206150" type="part" />);

    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
  });

  it('swaps to the fallback when the image fails to load', () => {
    render(<ItemImage src="https://example.test/gone.png" alt="Missing Set" type="set" />);

    fireEvent.error(screen.getByAltText('Missing Set'));

    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
  });

  it('keeps the item name reachable to assistive tech in the fallback', () => {
    render(<ItemImage src="" alt="Element 6206150" type="part" />);

    expect(screen.getByLabelText('Element 6206150')).toBeInTheDocument();
  });

  it('distinguishes the fallback by item type', () => {
    const { rerender } = render(<ItemImage src="" alt="a" type="set" />);
    expect(screen.getByTestId('image-fallback')).toHaveAttribute('data-type', 'set');

    rerender(<ItemImage src="" alt="a" type="minifig" />);
    expect(screen.getByTestId('image-fallback')).toHaveAttribute('data-type', 'minifig');

    rerender(<ItemImage src="" alt="a" type="part" />);
    expect(screen.getByTestId('image-fallback')).toHaveAttribute('data-type', 'part');
  });

  it('retries the real image when the url changes after a failure', () => {
    // Enrichment fills in imageUrl after the import lands, so a component stuck
    // in its failed state would never show the part photo it just fetched.
    const { rerender } = render(<ItemImage src="https://example.test/gone.png" alt="p" type="part" />);
    fireEvent.error(screen.getByAltText('p'));
    expect(screen.getByTestId('image-fallback')).toBeInTheDocument();

    rerender(<ItemImage src="https://example.test/found.png" alt="p" type="part" />);

    expect(screen.getByAltText('p')).toHaveAttribute('src', 'https://example.test/found.png');
  });
});
