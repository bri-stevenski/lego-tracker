---
name: anti-kragle
last_updated: "2026-07-20"
version: 1
---

# anti-kragle Strategy

## Target problem

An adult LEGO collector who buys, builds, tracks, and displays sets has to juggle a half-dozen disconnected apps — one to catalog, another for set values and shopping links, another for instructions and part lists, another to design MOCs — and none of them captures the rich purchase, condition, and storage provenance a serious collector actually needs, or tracks a set's state across its whole lifecycle from bought-in-a-bin to displayed-on-a-shelf. The gap is worst where AI meets building: using an AI assistant to design MOCs today produces instructions and part lists that are effectively unusable, so the most promising workflow is also the most broken.

## Our approach

Bet on being the single tool that owns a collector's entire LEGO lifecycle — buy, store, build, display, resell — rather than one more single-purpose catalog. The wedge that makes consolidation actually work is a provenance-first data model: capture far deeper per-set metadata than any existing app (purchase condition and completeness, storage location, box/instructions state, assembled-vs-bagged, session build-progress, trending value), because that depth is exactly what the backlog, resale, and display workflows run on. Everything else — scanning, instructions, missing-parts, AI assistance — attaches to that spine.

## Who it's for

An adult hobbyist LEGO collector who buys used sets and bulk lots (not just sealed retail), works through a build backlog over time, and cares about both displaying finished sets and preserving resale value. Tech-comfortable enough to want AI in the loop. Today they stitch together BrickLink, Brickset, omgbricks, spreadsheets, and a general AI assistant — one app per task, none of them connected.

## Key metrics

- App-consolidation rate: number of collection/build tasks done in-app vs. still requiring BrickLink/Brickset/omgbricks — tracked by self-audit or feature-usage logs.
- Backlog throughput: sets moved from "owned, unbuilt" to "built & displayed" per month — derived from set lifecycle-state timestamps in Supabase.
- Missing-parts capture accuracy: share of built sets where the background missing-parts list matched reality at completion — logged at set-completion.
- Metadata depth in practice: percent of owned sets with full provenance filled (condition, location, box/instructions state) — a query over the sets table.
- MOC instruction usability: whether an AI-designed MOC's exported instructions/part list were actually buildable without manual fixup — pass/fail logged per MOC export.

## Tracks

- Collection & provenance data model: deepening per-set metadata (condition, storage, box/instructions, build-state) as the spine everything attaches to.
- Build lifecycle & backlog: the owned to building to completed to displayed flow, session build-progress, and the "forgotten sets" backlog queue.
- Export & missing-parts interoperability: passive missing-parts capture plus shop-ready exports (BSX/LDraw/CSV) into BrickLink and friends.
- AI-assisted building: making AI-designed MOCs produce genuinely buildable instructions and part lists — the currently-broken workflow.
- Web platform stabilization: hardening the web app and proving confidence in the core flows before expanding surface area — the near-term priority over any mobile work.

## Milestones

- Web platform stabilization: harden core collection/build/export flows and prove confidence before expanding scope (current focus).
- Mobile companion (iOS + Android): future enhancement, deferred until the web platform is stable.
- LEGO-ecosystem intelligence: long-horizon — proactive suggestions for next purchase, next build, and where to source missing pieces.

## Not working on

- Not a marketplace or social/community platform — no listings, feeds, or friend systems.
- Not built for sealed-investment-only collectors — the focus is people who open, build, and display sets.
- Not a general-purpose inventory tool — LEGO-specific by design.
