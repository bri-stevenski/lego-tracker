# Spec: Enhance Barcode Lookup with Real-World Catalog Matching

## Context

Currently, Anti-Kragle only supports barcode lookup for a small set of hardcoded items in `seedCatalog`. Users expect the app to recognize any LEGO set barcode by querying an external database like Rebrickable.

## Requirements

1. **Global Barcode Support**: When a barcode is scanned, the app must first check the local `seedCatalog`, then the Supabase cache, and finally the Rebrickable API.
2. **External Mapping**: Rebrickable items found via barcode must be mapped to the `LegoCatalogItem` interface.
3. **Automatic Caching**: Any item successfully retrieved from Rebrickable via barcode should be cached in Supabase for future fast lookups.
4. **Error Handling**: If an item is not found, provide clear feedback that it's not in the database.

## Implementation Order

### Phase 1: Service Layer Enhancement
<!-- complexity: low -->
- [ ] Add `findRebrickableByBarcode` to `packages/core/src/services/rebrickable.ts`.
- [ ] Implement robust error handling for API rate limits and network failures.

### Phase 2: Domain Layer Integration
<!-- complexity: medium -->
- [ ] Update `packages/core/src/domain/catalog.ts` to include async barcode lookup.
- [ ] Integrate Supabase caching into the `findByBarcode` flow.
- [ ] Add unit tests for `findByBarcode` (mocking external services).

### Phase 3: UI Feedback & Verification
<!-- complexity: low -->
- [ ] Ensure the web UI handles the async nature of barcode lookup (show loading state if necessary).
- [ ] Verify with real LEGO barcodes (manual verification).

## Success Criteria

- Scanning a known LEGO barcode (e.g., `5702016913484` for set 75312) returns the correct item details.
- Retrieved items are stored in the Supabase `catalog_cache` table.
- `harness ci check` passes.
