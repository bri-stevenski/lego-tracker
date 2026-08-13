# Project Instructions: Anti-Kragle

These instructions are foundational mandates for all AI agents working in this repository.

## Documentation Standards

### Markdown Consistency

- **Rule**: All documentation changes MUST pass `npm run lint:md` before handoff.
- **Header Levels**: Strictly follow established header hierarchies. In `docs/roadmap.md`, Milestones MUST be `##` (H2) and Features MUST be `###` (H3) or appropriately nested list items.
- **Formatting**: Use ATX-style headers (`# Header`) and ensure blank lines surround headers and lists.

## Development Workflow

1. **Validation**: Always run `harness validate` and `npm run lint:md` after modifying documentation or configuration files.
2. **Architecture**: Core business logic belongs in `src/domain/` and must remain pure (no React or Browser API dependencies).
3. **Roadmap**: Use the `manage_roadmap` tool for updates, but manually verify the resulting structure against `docs/roadmap.md` formatting rules.

## Tooling

- **Linter**: `markdownlint-cli` (configured in `.markdownlint.json`).
- **Engineering Toolkit**: Harness CLI.
