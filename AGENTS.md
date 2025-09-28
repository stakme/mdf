# Collaboration Guide for AI Developers

## Repository Snapshot
- TypeScript project targeting Node.js, distributed as `markdfm` CLI and library.
- Source lives under `src/` (ESM, `.mts` modules); Vitest specs in `tests/` mirror CLI behavior.
- Build outputs land in `dist/` via `tsdown`; scripts in `scripts/` adjust post-build details (e.g., CLI shebang).
- Task briefs arrive as Markdown files inside `TODO/`, each with front matter describing status, authorship, and intent.

## Working a TODO Request
1. Read the newest Markdown brief in `TODO/` to capture goals, constraints, and desired UX.
2. Map requirements onto existing modules: CLI entry (`src/cli.mts`), command handlers (`src/commands/`), schema utilities (`src/front-matter*.mts`), config helpers, etc. Prefer extending existing abstractions before creating new ones.
3. Implement the behavior in TypeScript. Maintain the ESM style (`.mts`, top-level `await` only where already used) and reuse shared helpers from `src/utils/`.
4. Update or add Vitest coverage under `tests/`. Each feature change should have assertions for the happy path plus relevant edge cases or error conditions.
5. Run quality gates locally:
   - `npm run check` for TypeScript type safety.
   - `npm run build` to confirm bundling with tsdown stays stable.
   - `npm test` to ensure all specs—including new ones—pass against the built output.
6. If the TODO workflow expects the front matter `status` to change (e.g., to `done`), make that adjustment before handoff.

## Coding Notes
- Follow existing logging and error patterns—surface user-facing issues through `MarkdfmError` subclasses and catch them in the CLI for polite messaging.
- Commander command definitions live in `src/cli.mts`; keep option names, summaries, and UX consistent.
- Schemas rely on Zod; define reusable pieces in `front-matter*.mts` rather than duplicating literals.
- Prefer pure functions and dependency injection where possible to keep command handlers testable without the filesystem.

## Testing Strategy
- The `tests/helpers.ts` module offers utilities (temp directories, config builders). Use them to isolate fixtures and avoid polluting the repo.
- For CLI scenarios, assert on both stdout/stderr and filesystem side effects.
- When fixing regressions, add regression tests first when practical, then implement the fix.

## Deliverables Checklist
- [ ] Implementation linked to the TODO goals.
- [ ] Updated tests covering new behavior and failure modes.
- [ ] All npm scripts (`check`, `build`, `test`) succeed locally.
- [ ] Relevant documentation (README, code comments) refreshed when features alter existing guidance.
