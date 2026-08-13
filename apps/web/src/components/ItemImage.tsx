import React, { useState } from 'react';
import { Box, PersonStanding, Puzzle } from 'lucide-react';
import type { LegoItemType } from '@lego-tracker/core';

const fallbackIcons: Record<LegoItemType, typeof Box> = {
  set: Box,
  minifig: PersonStanding,
  part: Puzzle,
};

interface ItemImageProps {
  src: string;
  alt: string;
  type: LegoItemType;
}

/**
 * An item thumbnail that degrades to a typed placeholder instead of the
 * browser's broken-image glyph.
 *
 * Two cases produce no usable image, and both are normal rather than
 * exceptional: an imported Pick-a-Brick part has no image until enrichment
 * resolves it (and some elements are never catalogued at all), and a catalog
 * image URL can rot. Rendering `<img src="">` for either is what surfaced as
 * "there's no backup image".
 */
export function ItemImage({ src, alt, type }: ItemImageProps) {
  // Tracking *which* src failed rather than a bare boolean means a later src —
  // the one enrichment just filled in — gets a fresh attempt instead of
  // inheriting the previous URL's failure.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const usable = src.trim();
  if (!usable || failedSrc === src) {
    const Icon = fallbackIcons[type] ?? Box;
    // An empty `alt` marks the image decorative (the list repeats the name as
    // text right beside it), so the placeholder stays out of the accessibility
    // tree rather than announcing an unlabelled graphic.
    const labelling = alt ? { role: 'img' as const, 'aria-label': alt } : { 'aria-hidden': true };
    return (
      <div className="item-image-fallback" data-testid="image-fallback" data-type={type} {...labelling}>
        <Icon size={20} aria-hidden="true" />
      </div>
    );
  }

  return <img src={src} alt={alt} onError={() => setFailedSrc(src)} />;
}
