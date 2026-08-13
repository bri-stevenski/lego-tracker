export * from './config';
export * from './types/lego';
export * from './domain/catalog';
export { nowIso } from './domain/clock';
export * from './domain/collection';
export * from './domain/sync';
export * from './domain/options';
export * from './domain/export';
export * from './domain/import';
export * from './domain/enrich';
export * from './domain/partsExport';
export * from './services/rebrickable';
export * from './services/instructions';
// Explicit allowlist (not `export *`) so the test-only
// `__resetSupabaseClientForTests` helper never reaches the public surface.
export {
  ensureAnonymousSession,
  getSessionSnapshot,
  onSessionChange,
  linkEmailIdentity,
  getCachedItem,
  getCachedItemByBarcode,
  cacheCatalogItem,
  loadCollectionFromCloud,
  syncCollectionToCloud,
  isSupabaseConfigured,
  getSetParts,
  cacheSetParts,
} from './services/supabase';
export type { SessionResult, LinkResult } from './services/supabase';
export * from './infrastructure/download';
