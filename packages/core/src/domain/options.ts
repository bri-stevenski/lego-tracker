import type { AcquisitionQuality, BuildStatus, CollectionStatus, LegoItemType } from '../types/lego';

export const itemTypeLabels: Record<LegoItemType, string> = {
  set: 'Set',
  minifig: 'Minifig',
  part: 'Part',
};

export const statusLabels: Record<CollectionStatus, string> = {
  collection: 'Collection',
  wishlist: 'Wishlist',
};

export const qualityLabels: Record<AcquisitionQuality, string> = {
  new: 'New',
  'new-open-box': 'New, open box',
  'used-with-box-instructions': 'Used with box/instructions',
  'used-no-box': 'Used with no box',
  'used-no-instructions': 'Used with no instructions',
  'used-missing-parts': 'Used with missing parts',
};

export const buildStatusLabels: Record<BuildStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  complete: 'Complete',
};
