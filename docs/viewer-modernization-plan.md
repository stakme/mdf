# Viewer Modernization Plan

## Background

The current `viewer` command renders HTML by hand on the server, wiring a Hono HTTP app inside the CLI. Layout, navigation, and front matter listings are all concatenated strings that inject Tailwind CSS and shadcn styles at runtime via remote CDNs. The server also manages hot reload notifications and directory watching inside the command itself.【F:src/commands/viewer.mts†L725-L825】【F:src/commands/viewer.mts†L842-L921】

While the experience works, the implementation has grown difficult to extend: every UI change touches TypeScript string templates, styling depends on CDN-delivered Tailwind, and server logic, rendering, and data shaping are tightly coupled in a single module exceeding 900 lines.

## Goals & Constraints

- **Easier iteration on UI** – move UI rendering to component files with local dev tooling instead of string concatenation.
- **Modern styling pipeline** – bundle CSS alongside components and ship hashed assets instead of runtime CDN injects.
- **Keep the CLI contract** – the command must still run from Node without browser-specific build steps at runtime.
- **Preserve viewer features** – navigation tree, document view, front-matter index, filters, and hot reload must survive the migration.
- **Prefer progressive rollout** – avoid large-bang rewrites; keep ability to ship incremental improvements.

## Candidate Front-end Stacks

| Option | Pros | Cons |
| --- | --- | --- |
| **React + Vite** | Largest ecosystem, existing team familiarity, excellent tooling (Vite dev server, testing libraries), easy Tailwind integration, SSR/adapters available to serve static bundles through Hono. | Bundle size overhead if not tree-shaken; requires hydration management to keep payload small. |
| **SolidJS + Vite** | Smaller runtime, fine-grained reactivity lowers hydration cost, still works with Vite and Tailwind. | Less team experience, fewer ready-made components (e.g., shadcn support is experimental), requires upskilling for contributors. |
| **Native Web Components** | Framework-agnostic, minimal runtime if using Lit or vanilla, straightforward progressive enhancement. | Authoring ergonomics lower, more boilerplate to manage stateful UI, fewer off-the-shelf component libs, testing/story tooling less mature.

## Recommendation

Adopt **React + Vite** for the viewer UI. React aligns with the broader ecosystem, pairs well with Tailwind/shadcn, and integrates smoothly with Node-based tooling. Vite can emit a prebuilt bundle that the CLI serves as static assets while still allowing component-driven development locally.

## High-level Architecture

1. **Split data and presentation**
   - Keep the Hono server responsible for data preparation (`prepareViewerContext`) and filesystem watching.【F:src/commands/viewer.mts†L127-L159】【F:src/commands/viewer.mts†L162-L316】【F:src/commands/viewer.mts†L937-L1056】
   - Expose JSON endpoints for documents, navigation, and metadata instead of embedding HTML strings.
   - Serve a static `index.html` and asset manifest produced by Vite.
2. **Create `viewer-app/` workspace**
   - Initialize Vite + React + TypeScript project colocated in the repo.
   - Configure Tailwind (self-hosted styles) and shadcn components via PostCSS pipeline.
   - Use Vite's library mode or build hooks to emit assets into `dist/viewer` for the CLI.
3. **Hydration strategy**
   - Render navigation and document view as React components with client-side routing (e.g., React Router or TanStack Router) to mirror the existing navigation/hot reload behavior.
   - Load document bodies from pre-rendered HTML delivered by the CLI to avoid re-parsing Markdown on the client.
4. **Development ergonomics**
   - Provide `npm run viewer:dev` to start Vite dev server reading fixture JSON from the CLI command.
   - Maintain Storybook or Ladle for component-level QA (optional stretch goal).

## Migration Phases

1. **Planning & scaffolding**
   - Finalize data contracts (JSON shape for documents, navigation, filters).
   - Scaffold Vite project, configure Tailwind, add lint/test tooling.
2. **Incremental port**
   - Build React components for layout shell, navigation tree, header options, front matter index.
   - Implement client router + data fetching against new JSON endpoints.
   - Ensure feature parity with current viewer.
3. **CLI integration**
   - Extend `viewer` command to serve built assets and JSON endpoints.
   - Keep existing HTML renderer behind a feature flag until React build stabilizes.
   - Wire hot reload events to trigger frontend refresh (SSE remains in Node; client listens).
4. **Cleanup & deprecation**
   - Remove string-based HTML templates once new UI is stable.
   - Update docs/CHANGELOG and add regression tests for CLI endpoints.

## Risks & Mitigations

- **Bundle size regressions** – enforce performance budget via `bundlewatch` or Vite plugin, lazy-load routes, and hydrate only interactive regions.
- **Schema drift between CLI and UI** – codify TypeScript interfaces shared between Node and React (e.g., via `src/viewer/types.mts` re-exported to the Vite app through path aliases).
- **Hot reload parity** – reuse existing SSE endpoint; add E2E smoke tests to ensure filesystem changes trigger UI reloads.

## Success Metrics

- UI changes localized to React components with minimal edits to `viewer.mts`.
- Tailwind styles are bundled locally; viewer works offline.
- Automated tests cover navigation, front matter linking, and document rendering across CLI and UI layers.

