import React from 'react';
import { Plus } from 'lucide-react';
import { ItemImage } from './ItemImage';
import { CollectionStatus, LegoCatalogItem, OwnedLegoItem, itemTypeLabels } from '@anti-kragle/core';

// Distinct parts, not summed quantity: the badge has to agree with the list it
// sends you to, and a reorder is a set of elements rather than a piece count.
function missingPartCount(item: LegoCatalogItem | OwnedLegoItem): number {
  return (item as OwnedLegoItem).missingPartsList?.length ?? 0;
}

export function ItemList({
  activeView,
  catalogItems,
  ownedItems,
  selectedItemId,
  onSelect,
  onAdd,
}: {
  activeView: string;
  catalogItems: LegoCatalogItem[];
  ownedItems: OwnedLegoItem[];
  selectedItemId?: string;
  onSelect: (id: string) => void;
  onAdd: (item: LegoCatalogItem, status: CollectionStatus) => void;
}) {
  const listItems = activeView === 'catalog' ? catalogItems : ownedItems;

  if (listItems.length === 0) {
    return <div className="empty-state">No matching items yet.</div>;
  }

  return (
    <div className="item-list">
      {listItems.map((item) => (
        <article
          key={item.id}
          data-testid={`item-row-${item.id}`}
          className={selectedItemId === item.id ? 'item-row selected' : 'item-row'}
          onClick={() => onSelect(item.id)}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onSelect(item.id); }}
        >
          <ItemImage src={item.imageUrl} alt="" type={item.type} />
          <div>
            <div className="item-title-line">
              <strong>{item.number}</strong>
              <span>{itemTypeLabels[item.type]}</span>
              {activeView !== 'catalog' && missingPartCount(item) > 0 ? (
                <span
                  className="missing-badge"
                  data-testid={`missing-badge-${item.id}`}
                  title={`${missingPartCount(item)} missing ${missingPartCount(item) === 1 ? 'part' : 'parts'}`}
                >
                  {missingPartCount(item)}
                </span>
              ) : null}
            </div>
            <p>{item.name}</p>
            <small>{item.theme}</small>
          </div>
          {activeView === 'catalog' ? (
            <button
              className="mini-action"
              type="button"
              data-testid={`item-add-${item.id}`}
              title="Add to collection"
              onClick={(event) => {
                event.stopPropagation();
                onAdd(item, 'collection');
              }}
            >
              <Plus size={16} />
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
