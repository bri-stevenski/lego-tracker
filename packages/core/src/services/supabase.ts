import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LegoCatalogItem, LegoItemType, OwnedLegoItem, SyncQueueEntry, SetPart } from '../types/lego';
import { getConfig } from '../config';

let cachedClient: SupabaseClient | null = null;
let sessionCache: { userId: string | null; isAnonymous: boolean } = { userId: null, isAnonymous: false };

function getClient() {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (cachedClient) return cachedClient;
  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  cachedClient.auth.onAuthStateChange((_event, session) => {
    sessionCache = {
      userId: session?.user?.id ?? null,
      isAnonymous: session?.user?.is_anonymous ?? false,
    };
  });
  return cachedClient;
}

// Test-only: clears the singleton so each test starts clean.
export function __resetSupabaseClientForTests() {
  cachedClient = null;
  sessionCache = { userId: null, isAnonymous: false };
}

export type SessionResult =
  | { ok: true; userId: string; isAnonymous: boolean }
  | { ok: false; reason: 'offline' | 'anon-disabled' | 'rate-limited' | 'unknown' };

function reasonFromMessage(
  message: string | undefined,
  status?: number,
): 'offline' | 'anon-disabled' | 'rate-limited' | 'unknown' {
  const msg = (message ?? '').toLowerCase();
  return (
    msg.includes('disabled') ? 'anon-disabled'
    : (status === 429 || msg.includes('rate')) ? 'rate-limited'
    : msg.includes('fetch') || msg.includes('network') ? 'offline'
    : 'unknown'
  );
}

export async function ensureAnonymousSession(): Promise<SessionResult> {
  const supabase = getClient();
  if (!supabase) return { ok: false, reason: 'offline' };

  // D6 fail-open: no client call (getSession/signInAnonymously) may throw to the
  // caller — a rejected promise (lock timeout, unexpected error) maps to a typed
  // reason like every returned error does.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      sessionCache = { userId: session.user.id, isAnonymous: session.user.is_anonymous ?? false };
      return { ok: true, userId: session.user.id, isAnonymous: session.user.is_anonymous ?? false };
    }

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      const status = (error as { status?: number } | null)?.status;
      return { ok: false, reason: reasonFromMessage(error?.message, status) };
    }
    sessionCache = { userId: data.user.id, isAnonymous: data.user.is_anonymous ?? true };
    return { ok: true, userId: data.user.id, isAnonymous: data.user.is_anonymous ?? true };
  } catch (err) {
    return { ok: false, reason: reasonFromMessage(err instanceof Error ? err.message : undefined) };
  }
}

export function getSessionSnapshot(): { userId: string | null; isAnonymous: boolean } {
  return { ...sessionCache };
}

/**
 * Subscribe to auth-session changes (e.g. anonymous → email-linked on magic-link
 * return). Keeps the module session cache fresh and forwards each snapshot to the
 * caller so the hook layer never needs to import the client (RR-010). Returns an
 * unsubscribe; a no-op when Supabase is not configured.
 */
export function onSessionChange(
  cb: (snapshot: { userId: string | null; isAnonymous: boolean }) => void,
): () => void {
  const supabase = getClient();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    sessionCache = {
      userId: session?.user?.id ?? null,
      isAnonymous: session?.user?.is_anonymous ?? false,
    };
    cb({ ...sessionCache });
  });
  return () => data.subscription.unsubscribe();
}

export type LinkResult =
  | { ok: true }
  | { ok: false; reason: 'email-taken' | 'network' | 'invalid-email' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function linkEmailIdentity(email: string): Promise<LinkResult> {
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid-email' };
  const supabase = getClient();
  if (!supabase) return { ok: false, reason: 'network' };

  // Route the magic-link confirmation back to the running app so the
  // returning session can complete the account link (see onSessionChange).
  const options =
    typeof window !== 'undefined' ? { emailRedirectTo: window.location.origin } : undefined;
  const { error } = await supabase.auth.updateUser({ email }, options);
  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('registered') || msg.includes('taken') || msg.includes('exists')) {
      return { ok: false, reason: 'email-taken' };
    }
    return { ok: false, reason: 'network' };
  }
  return { ok: true };
}

function isValidLegoType(type: any): type is LegoItemType {
  return type === 'set' || type === 'minifig' || type === 'part';
}

function mapRowToItem(data: any): LegoCatalogItem {
  return {
    id: data.id,
    type: isValidLegoType(data.type) ? data.type : 'set',
    number: data.number,
    name: data.name,
    theme: data.theme,
    year: data.year,
    pieceCount: data.piece_count,
    retired: data.retired ?? false,
    estimatedValue: data.estimated_value ?? 0,
    imageUrl: data.image_url,
    barcode: data.barcode,
  };
}

function mapRowToOwnedItem(row: any): OwnedLegoItem {
  const catalog = row.catalog_cache;
  return {
    id: catalog.id,
    type: isValidLegoType(catalog.type) ? catalog.type : 'set',
    number: catalog.number,
    name: catalog.name,
    theme: catalog.theme,
    year: catalog.year,
    pieceCount: catalog.piece_count,
    retired: catalog.retired ?? false,
    estimatedValue: catalog.estimated_value ?? 0,
    imageUrl: catalog.image_url,
    barcode: catalog.barcode,
    status: row.status,
    // `?? undefined` is load-bearing: the column is NULL for wishlist items, and
    // the type declares this optional, not nullable. Passing NULL through as
    // `null` made a cloud-restored wishlist item fail storage validation and
    // vanish on the next load.
    acquiredQuality: row.acquired_quality ?? undefined,
    savedBox: row.saved_box,
    buildStatus: row.build_status,
    displayLocation: row.display_location ?? '',
    notes: row.notes ?? '',
    missingParts: row.missing_parts ?? '',
    missingPartsList: row.missing_parts_list ?? [],
    quantity: row.quantity,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Catalog Cache Services
 */

export async function getCachedItem(id: string): Promise<LegoCatalogItem | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('catalog_cache')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;

  return mapRowToItem(data);
}

export async function getCachedItemByBarcode(barcode: string): Promise<LegoCatalogItem | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('catalog_cache')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();

  if (error || !data) return null;

  return mapRowToItem(data);
}

export async function cacheCatalogItem(item: LegoCatalogItem) {
  const supabase = getClient();
  if (!supabase) return;

  const { error } = await supabase.from('catalog_cache').upsert({
    id: item.id,
    type: item.type,
    number: item.number,
    name: item.name,
    theme: item.theme,
    year: item.year,
    piece_count: item.pieceCount,
    retired: item.retired,
    estimated_value: item.estimatedValue,
    image_url: item.imageUrl,
    barcode: item.barcode,
  });

  if (error) {
    console.error(`Failed to cache catalog item ${item.id}:`, error.message);
  }
}

/**
 * Collection Sync Services
 */

export async function loadCollectionFromCloud(): Promise<{ items: OwnedLegoItem[]; tombstoneIds: string[] } | null> {
  const supabase = getClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_collection')
    .select('*, catalog_cache!item_id(*)')
    .eq('user_id', user.id);

  if (error || !data) return null;

  const items = (data as any[])
    .filter(row => !row.deleted_at)
    .map(mapRowToOwnedItem);

  const tombstoneIds = (data as any[])
    .filter(row => row.deleted_at)
    .map(row => row.item_id);

  return { items, tombstoneIds };
}

export async function syncCollectionToCloud(queue: SyncQueueEntry[]): Promise<void> {
  if (queue.length === 0) return;
  const supabase = getClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const upsertEntries = queue.filter((e): e is Extract<SyncQueueEntry, { type: 'upsert' }> => e.type === 'upsert');
  const deleteEntries = queue.filter((e): e is Extract<SyncQueueEntry, { type: 'delete' }> => e.type === 'delete');

  if (upsertEntries.length > 0) {
    const rows = upsertEntries.map(e => ({
      item_id: e.item.id,
      user_id: user.id,
      status: e.item.status,
      acquired_quality: e.item.acquiredQuality,
      saved_box: e.item.savedBox,
      build_status: e.item.buildStatus,
      display_location: e.item.displayLocation,
      notes: e.item.notes,
      missing_parts: e.item.missingParts,
      missing_parts_list: e.item.missingPartsList ?? [],
      quantity: e.item.quantity,
      added_at: e.item.addedAt,
      updated_at: e.item.updatedAt,
      deleted_at: null,
    }));

    const { error } = await supabase
      .from('user_collection')
      .upsert(rows, { onConflict: 'item_id,user_id' });

    if (error) {
      console.error('Cloud sync error:', error.message);
      throw error;
    }
  }

  for (const entry of deleteEntries) {
    const { error } = await (supabase
      .from('user_collection')
      .update({ deleted_at: entry.deletedAt })
      .eq('item_id', entry.itemId)
      .eq('user_id', user.id) as any);

    if (error) {
      console.error('Cloud delete error:', error.message);
      throw error;
    }
  }
}

export function isSupabaseConfigured(): boolean {
  return getClient() !== null;
}

/**
 * Set Parts Services
 */

function mapSetPartFromDb(row: Record<string, unknown>): SetPart {
  return {
    partNum: row.part_num as string,
    partName: row.part_name as string,
    colorName: row.color_name as string,
    quantity: row.quantity as number,
    bagNum: row.bag_num as number | null,
    imgUrl: row.img_url as string,
    isSpare: row.is_spare as boolean,
  };
}

export async function getSetParts(setId: string): Promise<SetPart[]> {
  const supabase = getClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('set_parts')
    .select('*')
    .eq('set_id', setId);

  if (error || !data) return [];
  return data.map(mapSetPartFromDb);
}

export async function cacheSetParts(setId: string, parts: SetPart[]): Promise<void> {
  const supabase = getClient();
  if (!supabase || parts.length === 0) return;

  const rows = parts.map(p => ({
    set_id: setId,
    part_num: p.partNum,
    part_name: p.partName,
    color_name: p.colorName,
    quantity: p.quantity,
    bag_num: p.bagNum,
    img_url: p.imgUrl,
    is_spare: p.isSpare,
  }));

  await supabase
    .from('set_parts')
    .upsert(rows, { onConflict: 'set_id,part_num,color_name', ignoreDuplicates: true });
}
