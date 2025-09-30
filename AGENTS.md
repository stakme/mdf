# Collaboration Guide for AI Developers

## Repository Snapshot

- TypeScript project targeting Node.js, distributed as `mdf` CLI and library.
- Source lives under `src/` (ESM, `.mts` modules); Vitest specs in `tests/`
  mirror CLI behavior.
- Build outputs land in `dist/` via `tsdown`; scripts in `scripts/` adjust
  post-build details (e.g., CLI shebang).
- Task briefs arrive as Markdown files inside `TODO/`, each with front matter
  describing status, authorship, and intent.
- Keep `README.md` user-facing; record developer or process notes in
  `AGENTS.md`, TODO briefs, or other internal docs instead.

## Working a TODO Request

1. Read the newest Markdown brief in `TODO/` to capture goals, constraints, and
   desired UX.
2. Map requirements onto existing modules: CLI entry (`src/cli.mts`), command
   handlers (`src/commands/`), schema utilities (`src/front-matter*.mts`),
   config helpers, etc. Prefer extending existing abstractions before creating
   new ones.
3. Implement the behavior in TypeScript. Maintain the ESM style (`.mts`,
   top-level `await` only where already used) and reuse shared helpers from
   `src/utils/`.
4. Update or add Vitest coverage under `tests/`. Each feature change should have
   assertions for the happy path plus relevant edge cases or error conditions.
5. Run quality gates locally:
   - `npx @biomejs/biome check --fix` to keep formatting and lint rules in sync.
   - `npm run check` for TypeScript type safety.
   - `npm run build` to confirm bundling with tsdown stays stable.
   - `npm test` to ensure all specs—including new ones—pass against the built
     output.
6. If the TODO workflow expects the front matter `status` to change (e.g., to
   `done`), make that adjustment before handoff.
7. Close the TODO via the CLI once everything is ready, for example:

```
npx @stakme/mdf run close ./TODO/01998ffb-72eb-73ba-ac94-8937607fe3b1.md

Updated ./TODO/01998ffb-72eb-73ba-ac94-8937607fe3b1.md
```

## Coding Notes

- Follow existing logging and error patterns—surface user-facing issues through
  `MdfError` subclasses and catch them in the CLI for polite messaging.
- Commander command definitions live in `src/cli.mts`; keep option names,
  summaries, and UX consistent.
- Schemas rely on Zod; define reusable pieces in `front-matter*.mts` rather than
  duplicating literals.
- Prefer pure functions and dependency injection where possible to keep command
  handlers testable without the filesystem.

## Testing Strategy

- The `tests/helpers.ts` module offers utilities (temp directories, config
  builders). Use them to isolate fixtures and avoid polluting the repo.
- For CLI scenarios, assert on both stdout/stderr and filesystem side effects.
- When fixing regressions, add regression tests first when practical, then
  implement the fix.

## Deliverables Checklist

- [ ] Implementation linked to the TODO goals.
- [ ] `npx @biomejs/biome check --fix` completes without findings.
- [ ] Updated tests covering new behavior and failure modes.
- [ ] All npm scripts (`check`, `build`, `test`) succeed locally.
- [ ] Relevant documentation (README, code comments) refreshed when features
      alter existing guidance.

Read @README.md for more information on this project.

## Release Management

The project follows SemVer and publishes to npm from GitHub Releases. AI developers are responsible for preparing release artifacts and metadata, not for pushing the publish button unless explicitly asked.

### Files AI Developers Manage

- `package.json` — bump the `version` field to the target release (e.g., `1.0.0`).
- `CHANGELOG.md` — add a new entry for the version with the date and categorized changes. Create this file if it doesn’t exist.
- `README.md` — update any versioned snippets, flags, or docs that changed since the last release.
- `TODO/` briefs — ensure any release‑related TODOs are updated (e.g., set `status` appropriately) when their scoped work is done.

Do not edit build outputs under `dist/`. The CI and `npm run build` regenerate them.

### Versioning Rules (SemVer)

- Major (`x.0.0`)
  - Backward‑incompatible changes to the CLI UX or library API (renamed/removed commands, flags, exports, or behavior changes that break consumers).
  - Raising the minimum supported Node.js version in `engines.node`.
- Minor (`x.y.0`)
  - Backward‑compatible features (new commands/options, new exports, new capabilities) and deprecations.
- Patch (`x.y.z`)
  - Backward‑compatible bug fixes, performance improvements, refactors, and documentation/test updates.

Pre‑releases use SemVer identifiers like `1.0.0‑beta.1` or `1.0.0‑rc.1`. When creating a GitHub Release marked as a prerelease, the workflow publishes with the `next` dist‑tag automatically.

Tip: Conventional Commits can guide bump decisions:

- `feat:` → usually Minor; add `!` or `BREAKING CHANGE:` footer to signal Major.
- `fix:` → Patch.
- `docs:`, `refactor:`, `perf:`, `test:` → Patch unless breaking behavior.

### Changelog Format

Keep a concise, user‑facing log per version with sections (use those that apply):

```
## [1.0.0] - 2025-09-30
### Added
- 
### Changed
- 
### Deprecated
- 
### Removed
- 
### Fixed
- 
### Security
- 
```

If `CHANGELOG.md` is missing, create it with a top‑level `# Changelog` header and the latest entry first. Summarize changes since the previous tag/release.

### Release Prep Checklist

- Decide bump: Major/Minor/Patch based on rules above.
- Update `CHANGELOG.md` with a new dated section for the version.
- Bump `package.json:version` to the new version.
- Run quality gates locally:
  - `npx @biomejs/biome check --fix`
  - `npm run check`
  - `npm run build`
  - `npm test`
- Commit with a clear message, e.g., `chore: release v1.0.0`.
- Create a Git tag `v1.0.0` and a GitHub Release. For prereleases, include a pre‑release suffix and mark the release as a prerelease.
- Let CI publish on release, or use `node scripts/publish.mjs --dry-run` to sanity‑check locally (omit `--dry-run` to publish manually when asked).

These practices aim to keep releases predictable and minimize manual steps.
