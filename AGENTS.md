# anti-kragle Knowledge Map

## Project Overview

**Anti-Kragle** (anti-kragle) is a local-first LEGO collection tracker. It allows users to search a seeded LEGO catalog, manage their collection and wishlist, and track item-level details like build status, condition, and display location. The project is architected with a portable domain model to support a future iOS client.

## Repository Structure

- `apps/web/src/api/`: React components, global styles, and the web entry point (`main.tsx`).
- `apps/web/src/services/`: Web-only side effects (storage, barcode camera access).
- `packages/core/src/domain/`: Pure business logic, catalog search, and collection management.
- `packages/core/src/services/`: External API integrations (Rebrickable, Supabase).
- `packages/core/src/types/`: Shared TypeScript contracts and interfaces.
- `apps/mobile/`: iOS client (React Native/Expo).
- `docs/`: Technical documentation, architecture guides, and user manuals.
- `.harness/`: Harness engineering metadata, learnings, and configuration.

## Development Workflow

1. **Local Development**: Run `npm run dev` to start the Vite development server.
2. **Architecture Compliance**: Ensure core logic stays in `src/domain` and is independent of browser/React APIs.
3. **Documentation**: Update `docs/` and `README.md` when adding new features or changing workflows.
4. **Validation**: Run `harness validate`, `npm run build`, and `npm run lint:md` before committing significant changes.
5. **CI Checks**: Run `npx harness ci check` to verify architecture, performance, and security constraints.

## Engineering Rules

### Markdown Consistency (ER-001)

**Rule**: All documentation must pass `npm run lint:md`.
**Mechanical Enforcement**: `markdownlint-cli` via `.markdownlint.json`.
**Why**: Ensures structural consistency (header levels, list indentation) for reliable parsing by AI agents and Harness tools.

## Documentation Index

- Main README: `README.md`
- Architecture: `docs/architecture.md`
- Setup: `docs/setup.md`
- User Guide: `docs/user-guide.md`

## Architecture

See `docs/architecture.md` for detailed architectural decisions and dependency diagrams.

## Canary Test Personas

Canary — formerly Oracle — is installed as a Claude Code plugin providing AI test
personas. No API key or additional configuration is required.

### Installation

If personas are not available, run:

```text
/plugin marketplace add https://github.com/bop-clocktower/canary
/plugin install canary@bop-clocktower
```

Then `/reload-plugins` to apply.

To check what you are running, or to pick up a newer release:

```text
/plugin marketplace update bop-clocktower
/plugin install canary@bop-clocktower
```

The marketplace and the installed plugin version independently — updating the
marketplace alone leaves the old version installed, so run both.

### Personas

| Persona | Purpose | Target |
| --- | --- | --- |
| `canary-test-author` | Generate Vitest or Playwright tests from natural language | `packages/core/src/` (Vitest) or `apps/web/tests/` (Playwright) |
| `canary-test-reviewer` | Review existing tests for quality and coverage gaps | Any test file |
| `canary-framework-advisor` | Recommend Vitest vs Playwright based on what is being tested | Call before authoring when the right layer is unclear |
| `canary-flake-hunter` | Diagnose intermittent failures — passes locally, fails in CI | `packages/core/src/**/*.test.ts` |
| `canary-test-healer` | Fix a consistently-failing test (distinct from flake-hunter) | Any failing test file |

### Test File Placement

Vitest tests go alongside source in `packages/core/src/domain/` and `packages/core/src/services/`. Playwright tests go in `apps/web/tests/` (created on first E2E generation).
