import React from 'react';
import { type LegoCatalogItem, type SetPart, partsToCSV, partsToBSX, downloadBlob } from '@anti-kragle/core';
import { useSetParts } from '../hooks/useSetParts';

export function PartsList({
  item,
  missingKeys,
  onToggleMissing,
}: {
  item: LegoCatalogItem;
  missingKeys?: Set<string>;
  onToggleMissing?: (part: SetPart) => void;
}) {
  const { parts, loading, error } = useSetParts(item);

  if (loading) {
    return <div className="parts-loading" data-testid="parts-loading">Loading parts…</div>;
  }
  if (error) {
    return <div className="parts-error" data-testid="parts-error">Couldn't load parts</div>;
  }
  if (parts.length === 0) return null;

  const nonSpares = parts.filter(p => !p.isSpare);
  const spares = parts.filter(p => p.isSpare);
  const hasNamedBags = nonSpares.some(p => p.bagNum !== null);

  const byBag = nonSpares.reduce<Record<string, SetPart[]>>((acc, part) => {
    const key = part.bagNum !== null ? String(part.bagNum) : 'all';
    (acc[key] ??= []).push(part);
    return acc;
  }, {});

  const allParts = [...nonSpares, ...spares];

  return (
    <section className="parts-list" data-testid="parts-list">
      <div className="parts-list-header">
        <h3 className="parts-heading">Parts</h3>
        <div className="parts-export">
          <button
            type="button"
            className="text-button"
            data-testid="parts-export-csv"
            onClick={() => downloadBlob(partsToCSV(allParts), `${item.number}-parts.csv`, 'text/csv')}
          >
            CSV
          </button>
          <button
            type="button"
            className="text-button"
            data-testid="parts-export-bsx"
            onClick={() => downloadBlob(partsToBSX(allParts), `${item.number}-parts.bsx`, 'application/xml')}
          >
            BSX
          </button>
        </div>
      </div>
      {hasNamedBags ? (
        Object.entries(byBag)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([bagKey, bagParts]) => (
            <details key={bagKey} className="parts-bag">
              <summary>
                Bag {bagKey} <span className="parts-count">({bagParts.length})</span>
                <span className="parts-bag-export">
                  <button
                    type="button"
                    className="text-button"
                    data-testid={`parts-bag-${bagKey}-export-csv`}
                    onClick={e => { e.preventDefault(); downloadBlob(partsToCSV(bagParts), `${item.number}-bag${bagKey}.csv`, 'text/csv'); }}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    data-testid={`parts-bag-${bagKey}-export-bsx`}
                    onClick={e => { e.preventDefault(); downloadBlob(partsToBSX(bagParts), `${item.number}-bag${bagKey}.bsx`, 'application/xml'); }}
                  >
                    BSX
                  </button>
                </span>
              </summary>
              <div className="parts-grid">
                {bagParts.map(p => (
                  <PartCard
                    key={`${p.partNum}-${p.colorName}`}
                    part={p}
                    isMissing={missingKeys?.has(`${p.partNum}:${p.colorName}`) ?? false}
                    onToggle={onToggleMissing}
                  />
                ))}
              </div>
            </details>
          ))
      ) : (
        <>
          <p className="parts-count">{nonSpares.length} parts</p>
          <div className="parts-grid">
            {nonSpares.map(p => (
              <PartCard
                key={`${p.partNum}-${p.colorName}`}
                part={p}
                isMissing={missingKeys?.has(`${p.partNum}:${p.colorName}`) ?? false}
                onToggle={onToggleMissing}
              />
            ))}
          </div>
        </>
      )}
      {spares.length > 0 && (
        <details className="parts-bag parts-spares">
          <summary>Spare parts <span className="parts-count">({spares.length})</span></summary>
          <div className="parts-grid">
            {spares.map(p => (
              <PartCard
                key={`${p.partNum}-${p.colorName}`}
                part={p}
                isMissing={missingKeys?.has(`${p.partNum}:${p.colorName}`) ?? false}
                onToggle={onToggleMissing}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function PartCard({
  part,
  isMissing,
  onToggle,
}: {
  part: SetPart;
  isMissing?: boolean;
  onToggle?: (part: SetPart) => void;
}) {
  return (
    <div
      className={`part-card${isMissing ? ' part-card--missing' : ''}`}
      data-testid="part-card"
    >
      <img
        src={part.imgUrl}
        alt={part.partName}
        className="part-img"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <span className="part-num">{part.partNum}</span>
      <span className="part-color">{part.colorName}</span>
      <span className="part-qty">×{part.quantity}</span>
      {onToggle && (
        <button
          type="button"
          className={`part-missing-btn${isMissing ? ' part-missing-btn--active' : ''}`}
          title={isMissing ? 'Remove from missing' : 'Mark as missing'}
          onClick={() => onToggle(part)}
          data-testid={`part-missing-${part.partNum}`}
        >
          {isMissing ? '✓' : '!'}
        </button>
      )}
    </div>
  );
}
