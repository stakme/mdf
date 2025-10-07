---
title: Configuration Guide
vpath: /
tags:
  - configuration
  - reference
draft: false
chapter: 102
---

# Configuration Guide

`.config/mdf.mts` is the source of truth for schema validation, template
defaults, aliases, and virtual-path behavior. Tuning it correctly keeps your
Markdown consistent while giving the CLI enough context to automate exports.

## Schema basics

Define a Zod object that describes every front matter field you care about. Use
`.default()` to backfill values when a field is missing.

```ts
import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({
    title: z.string(),
    status: z.enum(["todo", "in_progress", "done"]).default("todo"),
    author: z.string().optional(),
    tags: z.array(z.string()).default(() => []),
    created_at: z.iso.datetime().default(() => new Date().toISOString()),
    updated_at: z.iso.datetime().default(() => new Date().toISOString()),
  }),
});
```

Multiple schemas can coexist—use `defineSchema` with a `glob` to target
alternate directories (see the docs schema in this repository).

## Templates

Templates seed new notes with curated front matter and Markdown content. Each
template references one of your schemas.

```ts
templates: {
  bug_report: {
    schema: "default",
    frontmatter: {
      title: "[Bug] Summary",
      tags: ["bug"],
    },
    body: () => `# [Bug] Summary\n\n## Summary\n`,
  },
},
```

Set `defaultTemplate` to map schema names to the template they should use when
`mdf new` runs without `--template`.

```ts
defaultTemplate: {
  default: "default",
  docs: "doc_page",
},
```

## Virtual paths

Configure `virtualPath` with the front matter key that stores navigation routes.

```ts
virtualPath: {
  param: "vpath",
  separator: "/",
},
```

All commands that support virtual-path scoping (viewer, list, export, docs) rely
on this parameter. Choose URL-safe segments because they become part of the
exported paths.

## Aliases

Map friendly names to frequently used commands under the `aliases` key. Aliases
reduce repetition and are great for CI pipelines.

```ts
aliases: {
  todo: 'list --filter "status=todo" ./TODO',
  close: 'update --fm "status=done" --fm updated_at',
},
```

Run them with `mdf run close`.

## Sorting

Each schema can define a `sort` callback that determines document order when
building the viewer index. A simple ascending sort might use
`created_at.localeCompare` as in this repository. Customize it to bring the most
relevant docs to the top.

## Strictness and parsing

The CLI exposes `--strict` and `--ignore-invalid` flags when loading documents.
Use them sparingly—keeping the schema accurate and the defaults up to date is
usually the better long-term fix.

## Evolving the schema

- Bump the config version in README or docs when you add required fields so
  contributors know to rerun `mdf new`.
- Add Vitest coverage for new validation logic to keep behavior regression-free.
- When removing a field, update `templates`, `aliases`, and existing Markdown to
  avoid validation failures.
