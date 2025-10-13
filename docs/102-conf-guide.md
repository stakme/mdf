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

`.config/mdf.mts` defines your schema, template defaults, aliases, and virtual‑path behavior. A good config keeps Markdown consistent and gives the CLI the context it needs to automate exports.

## Schema basics

Declare a Zod object for every front‑matter field you care about. Use `.default()` to backfill missing values.

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

You can define multiple schemas with `defineSchema({ glob, schema })` to target different folders.

## Templates

Templates seed new notes with curated front matter and Markdown. Each template references a schema.

```ts
templates: {
  bug_report: {
    schema: "default",
    frontmatter: { title: "[Bug] Summary", tags: ["bug"] },
    body: () => `# [Bug] Summary\n\n## Summary\n`,
  },
},
```

Use `defaultTemplate` to tell `mdf new` which template to use when `--template` is omitted.

```ts
defaultTemplate: { default: "default", docs: "doc_page" },
```

## Virtual paths

Map the front‑matter key that stores navigation:

```ts
virtualPath: { param: "vpath", separator: "/" },
```

Commands that support virtual‑path scoping (`viewer`, `list`, `export`, `docs`) use this parameter. Choose URL‑safe segments; they become part of exported paths.

## Aliases

Aliases turn long commands into memorable shortcuts and keep CI consistent with local usage.

```ts
aliases: {
  todo: 'list --filter "status=todo" ./TODO',
  close: 'update --fm "status=done" --fm updated_at',
},
```

Run them with `mdf run <alias>`.

## Sorting

Schemas can define a `sort` callback to control ordering in the viewer index. For example, sort by `created_at` or a custom priority.

## Strictness and parsing

The CLI exposes `--strict` and `--ignore-invalid`. Prefer accurate schemas and defaults; reserve flags for exceptional cases.

## Evolving the schema safely

- Document required‑field changes so contributors rerun `mdf new` as needed.
- Add tests for new validation behavior.
- When removing a field, update templates, aliases, and existing notes to avoid breakage.

