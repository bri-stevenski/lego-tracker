---
type: decision
domain: services
tags: [adr, cloud-backup, anonymous-auth, supabase, strategy]
related: [services/supabase.ts, apps/web/src/hooks/useAuth.ts, docs/changes/cloud-backup/proposal.md]
---

# ADR 0001: Anonymous Cloud Backup over Full Auth

## Status

Accepted — 2026-07-20

## Context

Anti-Kragle stored the collection (with valuable provenance metadata) only in
`localStorage`. The cloud-sync path was dead: `loadCollectionFromCloud` /
`syncCollectionToCloud` early-returned on every call because there was no auth UI and
therefore no authenticated session. Data was unprotected against local storage loss, and
the fire-and-forget `catalog_cache` / `set_parts` inserts silently failed for want of a
session.

We needed cloud backup, but a full login surface (email/password or OAuth screens,
multi-device sync-conflict UX) is a large, product-shaping commitment. `STRATEGY.md`
commits to lifecycle consolidation and provenance — **stabilizing** the existing surface —
not to expanding into multi-device auth as a headline feature.

This ADR records decision **D1** from the cloud-backup spec. It is the durable,
product-shaping choice that later work (especially a future multi-device story) will
repeatedly reference. See `docs/changes/cloud-backup/proposal.md` → *Decisions Made* for
the full decision set (D2–D6); those are not restated here.

## Decision

Deliver cloud backup via an **anonymous** Supabase session (`signInAnonymously()`) created
silently on app boot — **not** a full authentication surface. This gives working, honest
backup with **zero login friction** by default.

Multi-device login is explicitly **deferred**. An optional email magic-link upgrade
(decision D2) exists as the *foundation* for future multi-device sync and as the recovery
path against total local loss, but the sync-conflict resolution UX is out of scope for this
change.

## Consequences

### Positive

- Backup works immediately for every visitor with no friction and no login screens to build
  or maintain.
- The anonymous `uid` is preserved when a user later links an email identity, so upgrading
  to a durable/portable account requires **no data migration** — existing `user_collection`
  rows carry over. Multi-device sync can be built on this foundation later without rework.
- Stays within the current architecture: auth wrappers live in core's `services/supabase.ts`
  and are consumed by web only through the public barrel + `useAuth` (decision D5), so the
  RR-010 layer boundary is not deepened.

### Negative / trade-offs

- An anonymous session token lives in `localStorage`. A full site-data wipe **orphans** the
  anonymous cloud data; the only protection is the optional account-link (D2).
- Backup is per-browser-profile until linked — not multi-device out of the box.
- Anonymous sign-in can fail (offline, anon sign-ins disabled on the project, or the per-IP
  rate cap). The app therefore **fails open** to local-only operation and reports
  `backupState === 'error'` (decision D6) rather than blocking or crashing.

## Knowledge Graph Concepts

Concepts introduced by this change and their relationships:

- **anonymous-session backup** — silent `signInAnonymously()` session drives cloud backup.
- **account-linking (uid preservation)** — `linkEmailIdentity` *upgrades* an anonymous
  session to an email identity, preserving `uid` and data.
- **single-flight reconcile** — `reconcile()` is *guarded-by* a module-level in-flight
  promise so concurrent triggers run exactly once.
- **fail-open backup** — on sign-in failure the app stays usable local-only.

Relationships: `SyncStatus` —reflects→ `reconcile` —guarded-by→ single-flight;
`linkEmailIdentity` —upgrades→ anonymous session.

## References

- Spec: `docs/changes/cloud-backup/proposal.md`
- Plan: `docs/changes/cloud-backup/plans/2026-07-20-cloud-backup-plan.md`
- Architecture: `docs/architecture.md` → *Authentication & Cloud Backup* (records D5)
