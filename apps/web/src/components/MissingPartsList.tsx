import React from 'react';
import { Trash2 } from 'lucide-react';
import { type MissingSetPart, type SetPart, partsToCSV, partsToBSX, partsToLDR, downloadBlob } from '@anti-kragle/core';

export function MissingPartsList({
  parts,
  setNumber,
  onRemove,
}: {
  parts: MissingSetPart[];
  setNumber: string;
  onRemove: (partNum: string, colorName: string) => void;
}) {
  if (parts.length === 0) return null;

  const asParts: SetPart[] = parts.map(p => ({
    ...p, bagNum: null, isSpare: false,
  }));

  return (
    <section className="missing-parts-section" data-testid="missing-parts-section">
      <div className="parts-list-header">
        <h3 className="parts-heading">
          Missing Parts <span className="parts-count">({parts.length})</span>
        </h3>
        <div className="parts-export">
          <button
            type="button"
            className="text-button"
            data-testid="missing-export-csv"
            onClick={() => downloadBlob(partsToCSV(asParts), `${setNumber}-missing.csv`, 'text/csv')}
          >
            CSV
          </button>
          <button
            type="button"
            className="text-button"
            data-testid="missing-export-bsx"
            onClick={() => downloadBlob(partsToBSX(asParts), `${setNumber}-missing.bsx`, 'application/xml')}
          >
            BSX
          </button>
          <button
            type="button"
            className="text-button"
            data-testid="missing-export-ldr"
            title="Open in BrickLink Studio or LDView"
            onClick={() => downloadBlob(partsToLDR(asParts, `Set ${setNumber} — Missing Parts`), `${setNumber}-missing.ldr`, 'text/plain')}
          >
            LDR
          </button>
        </div>
      </div>
      <div className="missing-parts-list">
        {parts.map(p => (
          <div
            key={`${p.partNum}:${p.colorName}`}
            className="missing-part-row"
            data-testid="missing-part-row"
          >
            <img
              src={p.imgUrl}
              alt={p.partName}
              className="missing-part-img"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="missing-part-info">
              <span className="part-num">{p.partNum}</span>
              <span className="part-color">{p.colorName}</span>
            </div>
            <span className="part-qty">×{p.quantity}</span>
            <button
              type="button"
              className="text-button missing-remove-btn"
              title="Remove from missing list"
              onClick={() => onRemove(p.partNum, p.colorName)}
              data-testid={`missing-remove-${p.partNum}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
