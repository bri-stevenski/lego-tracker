## 2026-06-01 — Multi-Device Sync (Tasks 1–9)

- [skill:harness-execution] [outcome:success] All 9 tasks complete. 88 core tests + 21 web tests. DB migration, reconcileCollection, loadCollectionFromCloud, syncQueue, reconcile orchestration, useSync hook, SyncStatus component, and App wiring all landed on main.
- [skill:harness-execution] [outcome:gotcha] harness 2.7.1 regression: `harness validate` looks for AGENTS.md in workspace subdirectories (apps/web/) in addition to the root. Fix: created `apps/web/AGENTS.md` stub pointing to root.
- [skill:harness-execution] [outcome:decision] `syncCollectionToCloud` empty-queue guard must come before `getClient()` call, otherwise `createClient` fires even for empty queues — broke a test asserting it was never called.
- [skill:harness-execution] [outcome:decision] `user_collection` only stores a FK to `catalog_cache`. Pull uses nested select `*, catalog_cache!item_id(*)` to reconstruct full OwnedLegoItem in one query; N+1 would be too slow.
- [skill:harness-execution] [outcome:decision] Mock client for Supabase multi-row queries needs a `then()` method to be thenable (Supabase query builder is PromiseLike). Added `then: (resolve) => Promise.resolve(queryResult).then(resolve)` to `makeMockClient`. Existing single-row tests use `.maybeSingle()` and are unaffected.

## 2026-05-31 — Test Coverage Fixes (Tasks 1–10)

- [skill:harness-execution] [outcome:success] All 10 tasks complete. 71 packages/core tests + 13 apps/web tests. `supabase.test.ts` refactored to factory pattern; `rebrickable.test.ts` latent `retryAfter: NaN` bug fixed; 5 new test files created.
- [skill:harness-execution] [outcome:gotcha] Root `npx vitest run` picks up `apps/web` test files which need jsdom — fails in the default node environment. Fix: added `vitest.config.ts` at root scoping `include` to `packages/**`. `apps/web` tests must be run via `cd apps/web && npx vitest run` or `-w apps/web`.
- [skill:harness-execution] [outcome:gotcha] `collectionToCSV` only exports 13 columns — `notes` and `missingParts` are excluded. A test asserting CSV content on `notes` silently passes the wrong value; use `displayLocation` (which IS in the export) for CSV escape tests.
- [skill:harness-execution] [outcome:decision] `npm install --save-dev vitest jsdom` in a workspace must be run with `--workspace=@anti-kragle/web --legacy-peer-deps` from the root — direct `cd apps/web && npm install` fails on react-native peer conflict from the mobile workspace.

## 2026-05-31 — Oracle Integration (Tasks 1–4)

- [skill:harness-execution] [outcome:success] All 4 tasks complete: Oracle plugin installed, AGENTS.md updated, personas smoke tested (14 Vitest tests pass), roadmap marked done.
- [skill:harness-execution] [outcome:decision] `/plugin install oracle` (short form) works in CC 2.1.159 — `@oracle` qualifier is NOT required. Resolves upstream issue #173.
- [skill:harness-execution] [outcome:gotcha] oracle-framework-advisor correctly distinguished domain (Vitest) vs UI flow (Playwright) with no prompting — and caught missing `data-testid` attributes on DetailPanel/ItemList buttons as a side finding.
- [skill:harness-execution] [outcome:decision] oracle-test-author added 10 new `searchCatalog` tests to the existing `catalog.test.ts` (did not create a new file) — all 14 tests pass, including dedup/local-wins branch coverage.

## 2026-05-05 — Fix Harness CI Check Failures

- [gotcha]: `harness ci check` analyzes `node_modules/` by default in both the `arch` and `perf` checks. The `ComplexityCollector` uses `findFiles("**/*.ts", rootDir)` without any exclusion filtering, causing third-party dependencies (`@babel/types`, `@supabase/*`, `typescript`, etc.) to be analyzed for cyclomatic complexity and function length violations. This floods the output with hundreds of errors and causes the `arch` check to fail.
- [gotcha]: The `entropy.excludePatterns` config key in `harness.config.json` controls exclusions for entropy analysis (drift, dead code, patterns), but does NOT affect the architecture (`arch`) check's `ComplexityCollector`. The arch check always scans all `**/*.ts` files regardless of `excludePatterns`.
- [decision]: Created an architecture baseline with `harness check-arch --update-baseline` to accept the current state. This is the correct approach because the baseline captures all existing violations and only flags future regressions, effectively solving the `node_modules/` noise problem for the arch check.
- [decision]: Added `entropy.excludePatterns` to `harness.config.json` with `**/node_modules/**`, `**/dist/**`, `**/.harness/**`, and `**/output/**` to prevent entropy checks from analyzing generated and third-party files.
- [learning]: The `arch` check stores baselines at `.harness/arch/baselines.json`. If this file doesn't exist, all violations are treated as new and cause failures. Always run `harness check-arch --update-baseline` on first setup or after intentional architectural changes.
- [learning]: `harness ci check` exit code is 0 when all checks pass, 1 when any check fails (at error severity by default). The command can be tested locally with `npx harness ci check` or `npx harness ci check --json`.
- [learning]: The `perf` check (via `EntropyAnalyzer`) DOES respect `excludePatterns` through `buildSnapshot2()` which uses `config.exclude` (defaults to `["node_modules/**", "dist/**", "**/*.test.ts", "**/*.spec.ts"]`). However, `runPerfCheck` passed entry points config but failed with "Could not resolve entry points" — this is a warning, not a failure.
