---
project: anti-kragle
version: 1.1.0
last_synced: 2026-08-01 (restored + reconciled against STRATEGY.md)
last_manual_edit: 2026-08-01
status: in-progress
strategy: STRATEGY.md
---

# Anti-Kragle Roadmap

Every initiative below carries a **Track** that maps it to one of the five tracks in
[`STRATEGY.md`](../STRATEGY.md). If an initiative does not map to a track, it does not
belong on this roadmap.

> **Milestone renumbering (2026-08-01):** cloud-backup shipped after M6 and now holds
> **M7**. The iOS client — previously M7 — is deferred per STRATEGY.md and no longer
> carries a milestone number. Web platform stabilization takes **M8** as the current focus.
>
> **Maintenance warning:** this file is hand-authored. `manage_roadmap` rewrote it to bare
> headings on 2026-07-20 (commit `9d8ae51`), destroying every Summary/Status/Tasks block.
> Always diff the result before committing if you run a roadmap generator against it.

## Engineering Foundation

- **Summary**: Harness engineering setup, CI, and project structure.
- **Status**: done
- **Milestone**: M1
- **Track**: Web platform stabilization
- **Tasks**:
  - [x] Fix CI check noise and architectural baselines
  - [x] Complete `AGENTS.md` for Harness validation
  - [x] Initialize `docs/roadmap.md`

## Canary Test Persona Integration

- **Summary**: Install the test-persona plugin and document usage in AGENTS.md. No
  CLI or CI gate in this iteration. Shipped as **Oracle** with four personas; the
  plugin was later renamed **Canary** and moved to `bop-clocktower/canary`, and the
  references were migrated 2026-08-02 (issue #6).
- **Status**: done
- **Milestone**: M1
- **Track**: Web platform stabilization
- **Spec**: docs/changes/oracle-integration/proposal.md — superseded by Canary, kept
  as a historical record. An earlier revision of this file claimed the spec "has
  never existed"; it did, but was stranded on an unmerged branch when PR #7 was
  squash-merged, and was recovered 2026-08-02.
- **Tasks**:
  - [x] Install plugin via Claude Code marketplace
  - [x] Add persona section to AGENTS.md
  - [x] Smoke test all four personas
  - [x] Migrate Oracle → Canary references (issue #6) — marketplace URL, install
        command, and persona names updated; `agents/` regenerated from the harness
        template, which had already been corrected upstream

## Catalog Expansion

- **Summary**: Integrated Rebrickable API and Supabase-backed catalog caching. Barcode lookup now chains seed catalog → Supabase cache → Rebrickable with auto-caching and full UI feedback. Bulk CSV seed pipeline seeds 27k sets with resolved theme names on demand.
- **Status**: done
- **Milestone**: M2
- **Track**: Export & missing-parts interoperability — the *ingest* side of
  LEGO-ecosystem interop, the same track M5/M6 export into. Previously tagged to
  the provenance track, which was too generous: this delivers *external set
  metadata* (part numbers, colours, themes), not the *user-specific* provenance
  STRATEGY.md calls for. Provenance itself is not unshipped — `acquiredQuality`,
  `savedBox`, `buildStatus`, `displayLocation`, and `quantity` have been in
  `user_collection` since the initial schema — but it arrived incidentally rather
  than as a deliberate initiative, and has never been deepened. See the
  Collection & Provenance Data Model section.
- **Tasks**:
  - [x] Integrate external catalog API (e.g., Rebrickable)
  - [x] Implement catalog caching/mirroring in Supabase
  - [x] Enhance barcode lookup with real-world catalog matching
  - [x] Bulk CSV import pipeline — seed catalog_cache from Rebrickable sets.csv + themes.csv (`npm run seed-catalog`)

## Data Portability & Sync

- **Summary**: JSON/CSV export, collection CSV import, and cloud sync via Supabase with multi-device reconciliation.
- **Status**: done
- **Milestone**: M3
- **Track**: Export & missing-parts interoperability
- **Tasks**:
  - [x] Export collection to JSON/CSV
  - [x] Basic cloud sync with Supabase
  - [x] Multi-device state reconciliation
  - [x] Import a collection from CSV — `packages/core/src/domain/import.ts` (PR #7)

## UI Polish

- **Summary**: Warm palette, dark mode via CSS custom properties, parts grid layout, mobile panel switching with back navigation.
- **Status**: done
- **Milestone**: M4
- **Track**: Web platform stabilization
- **Tasks**:
  - [x] Audit spacing — tighten sidebar padding, reduce card border-radius uniformity, add consistent vertical rhythm
  - [x] Typography — size/weight hierarchy for set names vs metadata vs labels
  - [x] Stat cards — subtle shadow + surface-alt background
  - [x] Item list — shadow lift on hover + translateY transition
  - [x] Detail panel — large image with shadow-lg, padding, soft background
  - [x] Badge/pill styling — gold-tinted price pill, neutral status pill
  - [x] Dark mode fine-tuning — CSS custom properties, verified contrast, warm palette
  - [x] Responsive polish — mobile panel switching (list ↔ detail) with ← Back nav

## Pick-a-Brick Parts List Export

- **Summary**: Per-set parts list view with CSV and BSX export. Parts fetched from Rebrickable on first view, cached in Supabase. Full-set and per-bag export supported.
- **Status**: done
- **Milestone**: M5
- **Track**: Export & missing-parts interoperability
- **Plan**: docs/changes/parts-export/plans/2026-06-04-parts-export-plan.md
- **Tasks**:
  - [x] Parse and store per-bag part assignments alongside set part data (Rebrickable bag field) — `set_parts` table + `cacheSetParts`
  - [x] Build parts-list view on set info page showing part image, number, color, quantity, grouped by bag — `PartsList` component
  - [x] Export full set parts list as Pick-a-Brick–compatible CSV (DesignNumber, ColorName, Quantity)
  - [x] Add per-bag export filter — CSV and BSX buttons on each bag row
  - [x] Support XML/BrickLink BSX export format (`partsToBSX` with `<ColorName>` fallback)

## In-App Building Instructions

- **Summary**: Instructions section in detail panel — fetches available booklets from LEGO's CDN via a Supabase Edge Function, shows download cards per booklet, links to LEGO.com. In-app PDF viewer and per-step part tracking deferred (LEGO PDFs are 100MB+, no cross-origin access, no structured step data).
- **Status**: done
- **Milestone**: M5
- **Track**: Build lifecycle & backlog
- **Plan**: docs/changes/instructions/plans/2026-06-04-instructions-plan.md
- **Tasks**:
  - [x] Source instruction PDFs via LEGO's instructions page (Edge Function scrapes page, extracts PDF links)
  - [x] Provide PDF download button per booklet (Part 1 of N, Part 2 of N, etc.)
  - [x] Surface instructions entry point from set info page — "Building Instructions" section with LEGO.com ↗ fallback
  - [ ] Render instructions step-by-step — deferred (CORS + 100MB+ file sizes make in-app PDF viewer impractical)
  - [ ] Track current step per set — deferred (depends on in-app viewer)
  - [ ] Record parts consumed per step — deferred (no structured step data from LEGO)

## Missing-Parts List from Instructions

- **Summary**: Mark individual parts as missing directly from the parts list. Missing parts appear in a dedicated section with CSV, BSX, and LDraw export. Stored in `OwnedLegoItem.missingPartsList` alongside the collection.
- **Status**: done
- **Milestone**: M6
- **Track**: Export & missing-parts interoperability
- **Plan**: docs/changes/missing-parts/plans/2026-06-04-missing-parts-plan.md
- **Tasks**:
  - [x] Allow manual marking/unmarking of parts as missing from the parts grid
  - [x] Aggregate missing parts into a set-level missing-parts list
  - [x] Expose missing-parts list on the set info page alongside the full parts list
  - [x] Remove parts from the missing list via trash icon
  - [x] Export missing-parts list as CSV and BrickLink BSX
  - [x] Export missing-parts list as LDraw `.ldr` — `partsToLDR` with 40-colour Rebrickable map (PR #8)
  - [ ] Per-step "mark as missing" during instruction playback — deferred (in-app viewer not yet built)
  - [ ] Deep-link from missing list to instruction step — deferred (depends on in-app viewer)
  - [ ] **Passive** missing-parts capture during a build — not started; STRATEGY.md calls for capture that does not require manual marking

## Anonymous Cloud Backup

- **Summary**: Anonymous Supabase session bootstraps on load and backs the collection up automatically; an optional "Secure my backup" magic link attaches an email to the same user id so the collection survives losing the device. Fail-open — the app stays usable with no network.
- **Status**: done (merged) / **not live in production**
- **Milestone**: M7
- **Track**: Web platform stabilization
- **Spec**: docs/changes/cloud-backup/proposal.md
- **ADR**: docs/knowledge/decisions/0001-anonymous-cloud-backup.md
- **Blockers**: issue #14 — hosted Supabase config is not done, so the feature is dormant in prod
- **Tasks**:
  - [x] Bootstrap an anonymous Supabase session on app load
  - [x] Back the collection up to `user_collection` scoped to `auth.uid()`
  - [x] Restore the collection from the cloud when local storage is empty
  - [x] Optional email account-linking via magic link (`linkEmailIdentity`)
  - [x] Backup status surfaced in the UI, with typed failure reason + Retry
  - [ ] Hosted Supabase config — anonymous sign-ins ON, redirect allow-list incl. the deployed origin, SMTP, env vars, RLS (issue #14, Part A)
  - [ ] Live end-to-end verification — `docs/changes/cloud-backup/LIVE-VERIFICATION.md` Parts B–G (SC1–SC9 were unit-verified with mocks only)

## Web Platform Stabilization

- **Summary**: Harden the core collection/build/export flows and prove confidence in them before expanding surface area. Per STRATEGY.md this is the near-term priority and takes precedence over any mobile work.
- **Status**: in-progress
- **Milestone**: M8
- **Track**: Web platform stabilization
- **Spec**: *not yet written*
- **Tasks**:
  - [ ] Land cloud-backup in production — close out issue #14 (see M7 blockers)
  - [x] Resolve architecture drift — `docs/architecture.md` called `domain/catalog.ts → services/*` a "Known violation" while `harness.config.json` allowed it. Resolved in favour of the config: documented as a scoped allowance for catalog orchestration, not debt
  - [ ] End-to-end coverage of the core flow: add set → parts list → mark missing → export → backup
  - [ ] Doc-drift sweep across `docs/` after the M1–M7 run of merges
  - [x] Bump the CI/mise Node pin from 20.20.2 to current LTS — now 24.18.1 (issue #9)
  - [ ] Close roadmap issues #2, #3, #4 — delivered in M5/M6, still open

## Collection & Provenance Data Model

- **Summary**: Deepen per-set metadata — purchase condition and completeness, storage location, box/instructions state, assembled-vs-bagged — as the spine the backlog, resale, and display workflows run on. This is the differentiating bet in STRATEGY.md.
- **Status**: planned
- **Milestone**: M9
- **Track**: Collection & provenance data model
- **Spec**: docs/changes/provenance-data-model/proposal.md
- **Tasks**:
  - [ ] Types + domain logic — condition axes, sealed-implies-complete invariant
  - [ ] v1→v2 migration transform, tested against fixtures before anything writes v2
  - [ ] Schema + RLS — `storage_locations`, `collection_events`, purchase columns
  - [ ] Storage layer — versioned key, retained `v1`, expiry
  - [ ] Sync — location upserts, event append, `schemaVersion` gate
  - [ ] UI — axis inputs, location picker, purchase fields
  - [ ] ADRs 0002 (hybrid over event sourcing) and 0003 (content-keyed identity)
  - [ ] Trending value moved to a fast-follow — needs an external price feed, out of scope
        for the data model itself

## Bulk Set Import

- **Summary**: Widen collection import from the single hardcoded OMG Bricks CSV parser to a general set/part importer — several file formats, import from a URL, and merge modes (append / replace / subtract). Modelled on Rebrickable's "Import Sets" dialog.
- **Status**: backlog
- **Track**: Export & missing-parts interoperability — the *ingest* counterpart to this track's exports, sharing its format vocabulary (CSV, BSX, LDraw)
- **Spec**: *not yet written*
- **Tasks**:
  - [ ] Shape the format matrix. Today `packages/core/src/domain/import.ts` handles exactly one shape — an OMG Bricks CSV with fixed columns — via `parseOmgBricksCSV`. Rebrickable's dialog accepts Brickset/Peeron CSV/TSV, BrickLink order/inventory and BrickStore XML, LDraw MPD/LDR, LDD LXF, Stud.io, plus any flat file with `set number`,`quantity` or `part`,`color`,`quantity` headers. Decide which of those are actually worth supporting before designing a parser interface.
  - [ ] Decide merge semantics. Append / replace / subtract are not just list operations here — they have to compose with sync tombstones and last-write-wins reconciliation, so "replace" in particular needs defining against a synced collection rather than a local array.
  - [ ] Decide whether import-from-URL is in scope. If so it needs domain validation up front: RR-002 was exactly this class of bug (Rebrickable pagination followed `page.next` URLs unvalidated, an SSRF vector).
  - [ ] Generalising `parseOmgBricksCSV` should decompose it, not extend it. It is already the worst complexity offender in the repo — cyclomatic 33 against a threshold of 15 — so adding formats to it in place would make a known-failing harness `arch` check worse.

## Build Lifecycle & Backlog

- **Summary**: The owned → building → completed → displayed flow, session build-progress, and a "forgotten sets" backlog queue.
- **Status**: backlog
- **Track**: Build lifecycle & backlog
- **Tasks**:
  - [ ] Shape set lifecycle states and their timestamps (no spec yet)

## AI-Assisted Building

- **Summary**: Make AI-designed MOCs produce genuinely buildable instructions and part lists — the workflow STRATEGY.md names as the most promising and the most broken.
- **Status**: backlog
- **Track**: AI-assisted building
- **Tasks**:
  - [ ] Shape the MOC instruction/part-list usability problem (no spec yet)

## iOS Client — Deferred

- **Summary**: Expanding to mobile using the shared domain model.
- **Status**: deferred
- **Milestone**: — (was M7; deferred 2026-07-20 per STRATEGY.md)
- **Track**: Mobile companion — a deferred STRATEGY.md milestone, not a current track
- **Blockers**: Web platform stabilization (M8) must land first
- **Tasks**:
  - [ ] Initialize iOS project (Swift/Compose Multiplatform)
  - [ ] Port shared domain types and validation logic
  - [ ] Native camera barcode scanning integration

## Intake

<!-- Rows below are appended by `manage_roadmap`. Keep the hand-authored sections above intact. -->

### cloud-backup

- **Status:** done
- **Spec:** docs/changes/cloud-backup/proposal.md
- **Summary:** Anonymous Cloud Backup with Optional Account-Linking
- **Blockers:** issue #14 — hosted Supabase config
- **Plan:** —
