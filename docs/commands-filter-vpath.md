---
title: Filters and Virtual Paths
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 250
---

# Filters and Virtual Paths

Front matter powers navigation and automation in `mdf`. Here’s how filters, virtual paths, and sorting work across `list`, `viewer`, `export`, and `docs`.

## Virtual paths

- Set the parameter in `.config/mdf.mts` under `virtualPath.param` (for example, `vpath`).
- Use `/` to build hierarchies like `docs/getting-started/installation`.
- `mdf list`, `mdf viewer`, and `mdf docs --vpath docs` scope results to entries whose virtual path starts with that prefix. The tree mirrors the segments.

## Filters

Slice collections by matching front‑matter values:

```bash
npx @stakme/mdf list TODO --filter "status=done"
```

Supported operators:

- `=` (or `:`) exact match
- `~=` substring
- `^=` prefix
- `$=` suffix

Arrays match when any element satisfies the expression. Combine multiple `--filter` flags with logical AND.

## Sorting

Define a schema‑level `sort` callback to control ordering (e.g., by `created_at`).

## Using filters during export

`mdf export` and `mdf docs` pass filter rules directly to the viewer context. The same expressions that power `list` determine which documents land in the static site.

```bash
npx @stakme/mdf docs TODO \
  --filter "status=done" \
  --filter "tags~=release" \
  --vpath docs/releases \
  --output public-docs
```

The command above publishes completed notes tagged `release` under `docs/releases`.

