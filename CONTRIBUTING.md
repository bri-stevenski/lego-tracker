# Contributing

## Development Setup

```bash
git clone https://github.com/ahhrealmonstr/anti-kragle.git
cd anti-kragle
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_REBRICKABLE_API_KEY
npm run web:dev
```

## Project Structure

```text
apps/web/        — Vite + React web app
packages/core/   — Shared domain logic, types, and services
supabase/        — Edge Functions and database migrations
scripts/         — One-off admin scripts (seed-catalog)
docs/            — Architecture, user guide, roadmap
```

## Running Tests

```bash
npm test                     # all tests (core + web)
npm run typecheck            # TypeScript across all packages
npm run lint                 # markdownlint across *.md and docs/**/*.md
npx vitest run               # core package tests only
npm run test -w apps/web     # web app tests only
```

A `pre-commit` hook runs these for you — install it once with
`npm run hooks:install`. It picks checks by what you staged: source files get
typecheck + tests, markdown gets `lint:md`, and a commit touching both gets
both. Bypass with `git commit --no-verify`.

## Pull Requests

1. Branch from `main`
2. One feature or fix per PR
3. All tests must pass — `npm test`
4. Typecheck must pass — `npm run typecheck`
5. Markdown must lint clean — `npm run lint`
6. Update `CHANGELOG.md` under `## Unreleased`

## Architecture

See [docs/architecture.md](docs/architecture.md) for layer boundaries and dependency rules.

The key constraint: `packages/core/src/domain/` must not import from `packages/core/src/services/`.
