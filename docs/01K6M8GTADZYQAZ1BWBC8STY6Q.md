---
title: Filters and Virtual Paths
vpath: cli
tags:
  - cli
  - reference
draft: false
chapter: 2.1
---

# Filters and Virtual Paths

Front matter drives navigation and automation in `mdf`. This guide explains how
filters, virtual paths, and sorting interact across commands like `list`,
`viewer`, `export`, and `docs`.

## Virtual paths

- Configure the virtual path parameter in `.config/mdf.mts` under
  `virtualPath.param`.
- Set the corresponding front matter field (for example, `vpath`) in each note.
- Use `/` to define hierarchies such as `docs/getting-started/installation`.

When you run `mdf list`, `mdf viewer`, or `mdf docs --vpath docs`, the CLI
scopes results to entries whose virtual path begins with that prefix. The tree
view mirrors the segments so readers can drill down by folder names.

## Filters

Filters slice the collection by matching front matter values.

```bash
npx @stakme/mdf list TODO --filter "status=done"
```

Supported operators:

- `=` (or `:`) for exact matches.
- `~=` for substring matches.
- `^=` for prefix matches.
- `$=` for suffix matches.

Arrays match when any element satisfies the expression. Chain multiple
`--filter` flags to combine conditions with logical AND.

## Sorting

The schema definition can provide a `sort` callback to control ordering. In this
project, TODO entries are sorted by `created_at`, ensuring newly authored docs
appear near the bottom of the tree unless you customize the timestamps.

## Using filters during export

`mdf export` and `mdf docs` pass filter expressions directly to the viewer
context preparation logic. That means the same rules that govern `list` also
determine which documents land in the static site. Combine filters with virtual
path scoping to publish a subset of notes:

```bash
npx @stakme/mdf docs TODO \
  --filter "status=done" \
  --filter "tags~=release" \
  --vpath docs/releases \
  --output public-docs
```

The command above keeps only completed notes tagged with `release` whose virtual
path starts with `docs/releases`.

## Tips

- Keep virtual path segments URL-safe; spaces and special characters become
  awkward URLs.
- Store human-readable navigation labels in the Markdown heading if your
  segments must stay short.
- Apply `mdf update --fm vpath=...` when reorganizing the tree; the command
  updates front matter without rewriting bodies.
- Remember that only `status=done` docs are exported by default. Override the
  filter list if you want to preview drafts.
