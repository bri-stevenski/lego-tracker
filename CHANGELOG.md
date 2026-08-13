# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Fixed

- **Wishlist items no longer disappear on reload.** `createOwnedItem` omits `acquiredQuality` for wishlist items and the field is optional on `OwnedLegoItem`, but storage validation required it — so every wishlist item was silently discarded by `loadCollection()`. The same item restored from the cloud hit the same fate, because a NULL `acquired_quality` column was mapped through as `null` rather than `undefined`. Both paths fixed; a present-but-invalid value is still rejected.

### Changed (Tooling)

- Node pinned to LTS 24.18.1 in both `mise.toml` and CI (was 20.20.2)
- `lint:md` is now enforced: 154 pre-existing markdownlint errors cleared, and the linter wired into CI plus the pre-commit hook. Markdown-only commits lint instead of skipping every check; mixed commits get both gates
- `restoreMocks: true` in both vitest configs — spies no longer leak their implementations into the next test. Three tests that passed only because of that leak now install their own mocks

### Added (Cloud Backup — anonymous session)

- Silent anonymous Supabase session on boot — cloud backup now works with zero login friction
- Optional "Secure my backup" email magic-link upgrade that preserves the same `uid` and data
- `ensureAnonymousSession`, `linkEmailIdentity`, `getSessionSnapshot`, `onSessionChange` auth wrappers in core, exposed via the public barrel
- `useAuth` web hook bootstrapping the session and tracking backup state
- Single-flight guard on `reconcile()` so concurrent triggers run exactly once
- Honest backup status UI: `backing-up → backed-up`, offline, and a distinguishable error state with a reason and Retry
- `enable_anonymous_sign_ins = true` in `supabase/config.toml`

### Changed

- Memoized the Supabase client as a singleton with a session cache
- `useSync` gates its first run on session readiness and surfaces a typed error reason instead of a blanket "Sync failed"

## 0.1.0 — 2026-06-18

### Added (M6 — Missing Parts)

- Mark individual parts as missing directly from the parts grid
- Structured `MissingSetPart[]` list replaces freeform missing-parts string
- `MissingPartsList` component with trash-icon removal
- CSV and BrickLink BSX export for missing-parts list
- `toggleMissingPart` domain function + `missingPartsList` on `OwnedLegoItem`
- `missing_parts_list` JSONB column in Supabase + cloud sync

### Added (M5 — Parts & Instructions)

- `PartsList` component: parts grid grouped by bag, with spare parts section
- Per-bag CSV and BSX export alongside full-set export
- CSV formula injection protection (`=+-@` prefix escaping)
- Building Instructions section in DetailPanel: booklet download cards per part
- Supabase Edge Function scraping LEGO.com for instruction PDFs
- `useInstructions` hook and `fetchInstructionBooklets` service

### Added (M4 — UI Polish)

- Dark mode via CSS custom properties, warm palette
- Mobile panel switching (list ↔ detail) with ← Back nav
- Stat cards, shadow lifts, badge/pill styling, parts grid layout

### Added (M3 — Sync)

- Multi-device sync via Supabase: tombstones, last-write-wins, offline queue
- `useSync` hook with 5-minute background interval and online/offline awareness
- `SyncStatus` indicator in sidebar

### Added (M2 — Catalog)

- Rebrickable API integration: live set/minifig search and barcode lookup
- Supabase catalog cache: lazy-fetch with auto-caching
- Bulk CSV seed pipeline: 27k sets from Rebrickable (`npm run seed-catalog`)
- Barcode scanner: chains seed catalog → Supabase cache → Rebrickable

### Added (M1 — Foundation)

- Vite + React web app (`apps/web`)
- `@anti-kragle/core` shared domain package
- Supabase-backed collection storage with RLS
- JSON/CSV collection export
- Harness engineering setup, Oracle test personas
