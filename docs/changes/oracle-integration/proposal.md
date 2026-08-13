# Oracle Test Persona Integration

> **SUPERSEDED — historical record.** Oracle was renamed to **Canary** and moved to
> `bop-clocktower/canary`. The `oracle-*` persona names below no longer exist; the
> current equivalents are `canary-test-author`, `canary-test-reviewer`,
> `canary-framework-advisor`, and `canary-flake-hunter` (plus `canary-test-healer`,
> which has no Oracle counterpart). See `AGENTS.md` for current usage, and issue #6
> for the remaining migration work.
>
> Recovered 2026-08-02 from the unmerged `claude/collection-import-uxqky5` branch,
> where it was stranded when PR #7 was squash-merged. Kept because `docs/roadmap.md`
> references it as the M1 spec, and because it records why the integration was
> scoped the way it was.

## Overview and Goals

Make Oracle's four AI test personas available inside anti-kragle's Claude Code
environment. Any team member should be able to discover and use them without
reading Oracle's upstream README.

**What this delivers:**

- `oracle-test-author` — generate Vitest or Playwright tests from natural
  language
- `oracle-test-reviewer` — review existing tests for quality and coverage gaps
- `oracle-framework-advisor` — recommend Vitest vs Playwright based on what is
  being tested
- `oracle-flake-hunter` — identify flaky or brittle tests in the codebase

**Out of scope:** Oracle CLI, npm scripts, CI gates — deferred to a future
iteration.

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Plugin-only, no CLI | Avoids Python/pipx dependency; personas cover the interactive use case |
| Both test layers | `oracle-framework-advisor` classifies per-request; no artificial constraint needed |
| Tests alongside source | Generated tests that pass review belong with the code they test; no runner config changes |
| No API key configuration | v3 removed the API key requirement; plugin runs through Claude Code's own session auth |

## Technical Design

### Installation

One-time, interactive in Claude Code:

```text
/plugin marketplace add https://github.com/bri-stevenski/oracle-test-ai-agent
/plugin install oracle
```

No environment configuration is required. Oracle's plugin runs through Claude
Code's existing session auth (v3+).

### AGENTS.md Update

A new `## Oracle Test Personas` section will be added listing the four personas,
their purpose, and which layer each targets:

- `oracle-test-author` → Vitest (domain/services) or Playwright (web UI)
- `oracle-test-reviewer` → any existing test file
- `oracle-framework-advisor` → call before authoring when the right layer is
  unclear
- `oracle-flake-hunter` → run against `packages/core/src/**/*.test.ts`

### Test File Placement

No change to existing conventions:

- Vitest: `packages/core/src/domain/*.test.ts`,
  `packages/core/src/services/*.test.ts`
- Playwright: `apps/web/tests/` (new directory, created when first E2E test is
  generated)

Oracle's plugin wires its own harness MCP server on install — no harness config
changes needed.

## Integration Points

### Entry Points

- Four new slash commands registered by the Oracle plugin:
  `oracle-test-author`, `oracle-test-reviewer`, `oracle-framework-advisor`,
  `oracle-flake-hunter`
- `apps/web/tests/` directory created on first Playwright test generation

### Registrations Required

None — `/plugin install` is the only step needed. No barrel exports, route
registrations, or harness skill tier assignments required.

### Documentation Updates

- `AGENTS.md` — new `## Oracle Test Personas` section

### Architectural Decisions

None — this is a tooling addition with no impact on application architecture.

### Knowledge Impact

Oracle enters the knowledge graph as the project's AI test generation layer,
covering both Vitest (core) and Playwright (web) targets.

## Success Criteria

1. Running `/plugin install oracle` in a anti-kragle Claude Code session
   completes without error.
2. All four Oracle personas are invocable by name in Claude Code.
3. `oracle-test-author` generates a valid Vitest test for a domain function
   (e.g. catalog search) that passes `npm run test`.
4. `oracle-test-author` generates a valid Playwright test for a web UI flow that
   runs without error.
5. `oracle-framework-advisor` recommends Vitest for a domain prompt and
   Playwright for a UI prompt.
6. `AGENTS.md` Oracle section is present and passes `npm run lint:md`.

## Implementation Order

### Phase 1 — Install (5 min)

Install the Oracle plugin via Claude Code marketplace. Verify all four personas
are accessible.

### Phase 2 — Project Wiring (10 min)

Add the Oracle section to `AGENTS.md`. Commit.

### Phase 3 — Smoke Test (10 min)

Invoke `oracle-framework-advisor` to confirm it responds. Invoke
`oracle-test-author` for one domain prompt (catalog search) and one UI prompt.
Confirm outputs are valid and the test runner accepts them.
