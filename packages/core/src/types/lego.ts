// 'part' covers a single element (a specific mould in a specific colour), which
// is what a Pick-a-Brick export contains. Sets and minifigs are catalogued by
// set/fig number; a part is catalogued by LEGO element id.
export type LegoItemType = 'set' | 'minifig' | 'part';

export type AcquisitionQuality =
  | 'new'
  | 'new-open-box'
  | 'used-with-box-instructions'
  | 'used-no-box'
  | 'used-no-instructions'
  | 'used-missing-parts';

export type BuildStatus = 'not-started' | 'in-progress' | 'complete';

export type CollectionStatus = 'collection' | 'wishlist';

export interface LegoCatalogItem {
  id: string;
  type: LegoItemType;
  number: string;
  name: string;
  theme: string;
  year: number;
  pieceCount: number;
  retired: boolean;
  estimatedValue: number;
  imageUrl: string;
  barcode?: string;
}

export interface OwnedLegoItem extends LegoCatalogItem {
  status: CollectionStatus;
  acquiredQuality?: AcquisitionQuality;
  savedBox: boolean;
  buildStatus: BuildStatus;
  displayLocation: string;
  notes: string;
  missingParts: string;
  missingPartsList?: MissingSetPart[];
  quantity: number;
  addedAt: string;
  updatedAt: string;
}

export interface CollectionSummary {
  collectionCount: number;
  wishlistCount: number;
  totalEstimatedValue: number;
  completeBuilds: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export type SyncQueueEntry =
  | { type: 'upsert'; item: OwnedLegoItem }
  | { type: 'delete'; itemId: string; deletedAt: string };

export interface MissingSetPart {
  partNum: string;
  partName: string;
  colorName: string;
  quantity: number;
  imgUrl: string;
}

export interface InstructionBooklet {
  title: string;
  url: string;
}

export interface SetPart {
  partNum: string;
  partName: string;
  colorName: string;
  quantity: number;
  bagNum: number | null;
  imgUrl: string;
  isSpare: boolean;
}
