---
title: Configuration Guide
vpath: /
tags:
  - docs
  - reference
draft: false
chapter: 102
---

This guide explains everything you can put in `.config/mdf.*`, how the CLI loads
it, and how options interact. Examples below are TypeScript, but JSON and
JavaScript configs are also supported.

## Where the config lives

- Location: `.config/mdf.mts` in your project root (the working directory where
  you run `mdf`).
- Optional local overrides: `.config/mdf.local.*` (same set of extensions).
  Values here merge into the base config (details in “Local overrides and
  merging”).

## TypeScript helpers

Import helpers from `@stakme/mdf/config` inside `.mts` configs:

```ts
import { defineConfig, defineSchema, z } from "@stakme/mdf/config";
```

- `z` is Zod (with `z.iso.date()`, `z.iso.datetime()`, etc.).
- `defineConfig` returns its argument, aiding IntelliSense and type checking.
- `defineSchema` lets you attach schema‑level options like `glob`, `sort`,
  `visibleFields`, `filename`, `vpath`, and `vslug` alongside a Zod object.

## Quick examples

Single schema (minimal):

```ts
export default defineConfig({
  schema: z.object({
    title: z.string(),
    status: z.enum(["todo", "in_progress", "done"]).default("todo"),
    vpath: z.string().optional(),
    tags: z.array(z.string()).default(() => []),
  }),
});
```

Multiple schemas with directory routing and templates:

```ts
export default defineConfig({
  schema: [
    defineSchema({
      name: "docs",
      glob: "docs/**",
      schema: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        vpath: z.string().min(1).optional(),
        vslug: z.string().min(1).optional(),
        draft: z.boolean().default(false),
        chapter: z.number().default(0),
        tags: z.array(z.string()).default(() => []),
      }),
      sort: (a, b) => a.chapter - b.chapter,
      visibleFields: ["tags"],
      filename: (fm) => `${fm.title}.md`,
      vpath: (fm) => fm.vpath?.trim() || "/",
      vslug: (fm) =>
        (fm.vslug?.trim() || fm.title).toLowerCase().replace(/\s+/g, "-"),
    }),
    defineSchema({
      name: "default",
      glob: "**",
      schema: z.object({
        title: z.string(),
        vpath: z.string().optional(),
        vslug: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done"]).default("todo"),
        author: z.string().optional(),
        tags: z.array(z.string()).default(() => []),
        created_at: z.iso.datetime().default(() => new Date().toISOString()),
        updated_at: z.iso.datetime().default(() => new Date().toISOString()),
      }),
      sort: (a, b) => a.created_at.localeCompare(b.created_at),
      filename: () => `${Date.now()}.md`,
      vpath: (fm) => fm.vpath?.trim() || fm.status || "todo",
      vslug: (fm) =>
        (fm.vslug?.trim() || fm.title || "").toLowerCase().replace(/\s+/g, "-"),
    }),
  ],
  defaultSchema: ["docs", "default"],

  templates: {
    backlog: {
      schema: "default",
      frontmatter: { title: "" },
      body: ({ title }) =>
        `# ${title}\n\n## What I need\n\n## So I will create...\n`,
    },
  },
  defaultTemplate: { default: "backlog" },
  aliases: {
    todo: 'list --filter "status=todo" ./TODO',
  },
});
```

## Top‑level options

Each key below lives at the root of the exported object.

### `schema` (required)

What the front matter must look like. Three shapes are supported:

- A single Zod object: `schema: z.object({...})`
- An array of entries:
  `schema: [defineSchema({ name, glob?, schema, sort?, visibleFields?, filename?, vpath?, vslug? }), ...]`
- A record of named entries:
  - `schema: { notes: z.object({...}), docs: defineSchema({ schema: z.object({...}), glob: "docs/**" }) }`

Entry fields (when using `defineSchema` or record entries as objects):

- `name` (string): Schema name. Required for arrays; when using a record, the
  object key is the name.
- `schema` (Zod object): Front‑matter shape. Required.
- `glob` (string): Which files use this schema when listing/browsing/generating
  under a directory. Supports `*`, `**`, and `?` with forward slashes. First
  matching schema (by priority) wins; otherwise the default schema applies.
- `sort` ((a, b) => number): Per‑schema sort used by `list`, `viewer`, and
  `export`. Only compares files within the same schema; ties fall back to a
  stable title/route order.
- `visibleFields` (string[]): Optional allow‑list of front‑matter keys to
  display in the viewer’s sidebar details.
- `filename` ((data) => string | Promise<string>): Compute the filename from
  parsed front matter when creating files that target this schema. The
  configured `extension` is appended if missing.
- `vpath` ((data) => string | Promise<string>): Generate or normalize the
  virtual path stored under `virtualPath.param` when the field is empty. Return
  the path segments joined with the configured separator (default `/`).
- `vslug` ((data) => string | Promise<string>): Generate or normalize the slug
  stored under `virtualSlug.param` when the field is empty. Return a non‑empty
  string identifying the document’s route.

### `defaultSchema`

Controls the default and, optionally, resolution priority when multiple schemas
exist.

- String: `defaultSchema: "docs"`. That schema is both default and last in
  priority.
- String array: `defaultSchema: ["docs", "default"]`. Order sets priority (first
  wins when `glob` patterns overlap), and the last item becomes the default
  schema.

Errors if names are unknown, duplicated, or the array does not end with the
default.

### `defaults`

Global default front‑matter values used by `mdf new` before parsing with Zod.
Accepts either an object or a function that receives `{ now: Date }` and returns
an object. Template defaults (see below) layer on top of config defaults.

### `content`

Default Markdown body for `mdf new` when no template `body` is used. Either a
string or a function receiving `{ data, now }` (where `data` is the parsed front
matter) and returning a string.

### `fileName`

Project‑wide filename generator when creating new files. Receives
`{ data, directory, now }`. Used only if the CLI `--filename` flag is not
provided and the active schema definition does not define `filename`.

Filename precedence when running `mdf new`:

1. CLI `--filename` > 2) schema `filename` > 3) config `fileName` > 4)
   time‑based ID (`ulid` by default or `uuid` if configured). The `extension` is
   appended if missing.

### `extension`

The file extension to use when creating new notes (default `.md`). Provide with
or without a leading dot.

### `templates`

Reusable starting points for `mdf new`.

- Each template is an object with:
  - `schema?` (string): Target schema name for this template. If the user
    explicitly chooses the template (`--template`), the template’s schema
    applies. If the template is only picked implicitly via `defaultTemplate` and
    its schema differs from the directory’s selected schema, the directory’s
    schema is kept.
  - `frontmatter?` (object or `(ctx) => object`): Defaults layered after config
    `defaults` and before CLI `--fm` overrides. The function receives `{ now }`
    and returns an object.
  - `body?` (string or `(ctx) => string`): Markdown body. The function receives
    `{ ...data, data, now }` where `data` is the parsed front matter and
    properties are also spread at top level for convenience.

### `defaultTemplate`

Map schema names to the template name to apply automatically when the user does
not pass `--template`. Errors if schemas or templates are unknown.

### `virtualPath`

Enable tree views and virtual path scoping for `list`, `viewer`, and `export`.

- `param` (string, required): Name of the front‑matter field that holds the path
  (top‑level key; not dot‑notation). Values are split into segments.
- `separator` (string, default `/`): Character used to split `param` into
  segments.

### `virtualSlug`

Control the viewer route for each document.

- `param` (string): Front‑matter field to use for the route path. Supports
  dot‑notation (e.g., `meta.slug`). Must resolve to a non‑empty string like
  `docs/getting-started`. When absent, the route falls back to the normalized
  file name.

### `aliases`

Shortcuts for `mdf run` that expand to full CLI invocations. Must be a map of
non‑empty strings to non‑empty strings.

```ts
aliases: {
  todo: 'list --filter "status=todo" ./TODO',
  build_docs: 'export --filter "draft=false" --repo-url https://example.com/repo/blob/main ./docs',
}
```

### `repo`

Configure a “View on GitHub/GitLab” button in the viewer/export UIs.

- `icon`: `"github"` or `"gitlab"` (auto‑inferred from URL when not overridden
  via CLI).
- `url`: Base URL pointing at the branch/root that contains your Markdown. The
  app appends each document’s workspace‑relative path.

The CLI flags `--repo-url` and `--repo-icon` can override these at runtime.

## Local overrides and merging

Place overrides in `.config/mdf.local.*`. They are merged into the base config
with these rules:

- `schema`: Entries merge by name. If both sides are Zod objects, their shapes
  merge (Zod `.merge`). If the local side provides a non‑object Zod type, it
  overrides the base. Per‑entry options (`glob`, `sort`, `visibleFields`,
  `filename`, `vpath`, `vslug`) fall back to the base when omitted in the local
  file.
- `defaultSchema`/priority: The local value wins. When provided as an array, it
  becomes the priority order; the last element is the default.
- `defaults`, `content`, `fileName`, `extension`, `virtualPath`, `virtualSlug`,
  `repo`: The local value wins when provided; otherwise the base value is kept.
- `templates`: Shallow merge by template name (local wins on conflicts).
- `defaultTemplate`: Shallow merge by schema name (local wins on conflicts).
- `aliases`: Shallow merge by alias name (local wins on conflicts).

Example local override that adds a default author:

```ts
// .config/mdf.local.mts
import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({ author: z.string().default("@stakme") }),
});
```

## How schema selection works

- The configured `defaultSchema` is used when no `glob` matches.
- When multiple schemas have `glob` patterns, the CLI orders them by the
  `defaultSchema` priority (if provided as an array). It selects the first
  schema whose `glob` matches the file’s workspace‑relative path.
- Globs use `*`, `**`, and `?`, and match with forward slashes. They are
  anchored to the full relative path.

## Defaults and overrides order (mdf new)

When creating a file, values resolve in this order (later wins):

1. Config `defaults`
2. Template `frontmatter`
3. CLI `--fm key=value` flags
4. Zod defaults inside the schema (applied during parsing)

Body content precedence:

1. Template `body`
2. Config `content`
3. Empty body

## Common validation rules and errors

- `schema` must be present and define at least one entry.
- `defaultSchema` must reference a known schema. As an array, it must be
  non‑empty, contain unique names, and end with the default schema.
- `templates` that specify `schema` must reference a known schema.
- `defaultTemplate` mappings must reference known schemas and existing template
  names.
- `virtualPath.param` must be a non‑empty string (top‑level field).
  `virtualPath.separator`, when provided, must be a non‑empty string.
- `virtualSlug.param`, when provided, must resolve to a non‑empty string
  (dot‑notation allowed). Values cannot include `.` or `..` segments.
- `aliases` must map non‑empty strings to non‑empty strings.
- `repo.icon` must be `"github"` or `"gitlab"`; `repo.url` must be a non‑empty
  string.

## Real‑world reference

[This project’s own config](https://github.com/stakme/markdfm/blob/main/.config/mdf.mts)
demonstrates many features: see `.config/mdf.mts`. Local overrides (when
present) go in `.config/mdf.local.mts` and are merged as described above.
