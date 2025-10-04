---
title: CLI Reference
vpath: cli
tags:
  - cli
  - reference
draft: false
chapter: 2.0
---

# CLI Reference

`mdf` ships a collection of subcommands that work together to scaffold, inspect,
repair, and publish Markdown notes. Run any command with `--help` for the
exhaustive option list.

## init

Generate a starter `.config/mdf.mts` anywhere under your repository.

```bash
npx @stakme/mdf init
```

The initializer writes a schema stub and template defaults. Edit it right away
to reflect your required fields, virtual path parameter, and aliases.

## new <directory>

Scaffold Markdown that conforms to your schema.

```bash
npx @stakme/mdf new TODO \
  --template default \
  --fm title="Investigate viewer" \
  --fm tags='["research"]'
```

Combine templates with `--fm` overrides for repeatable structures.

## list <directory>

Explore notes, apply filters, and render custom output.

```bash
npx @stakme/mdf list TODO \
  --filter "status=done" \
  --vpath docs \
  --format "[{{status}}] {{title}}"
```

`--format` swaps the tree view for templated one-line summaries. Dot notation
targets nested front matter fields.

## validate <directory>

Check every file against the schema. The command exits non-zero when problems
are detected so CI can block merges.

```bash
npx @stakme/mdf validate TODO
```

## fix <directory>

Repair schema violations automatically by replaying defaults and CLI overrides
onto each file.

```bash
npx @stakme/mdf fix TODO --fm status=todo
```

## update <files...>

Apply targeted front matter updates without touching the Markdown body.

```bash
npx @stakme/mdf update ./TODO/01ABC.md \
  --fm status=done \
  --fm updated_at
```

Omitting a value (as with `updated_at` above) instructs `mdf` to regenerate it
using the schema default.

## viewer <directory>

Launch an interactive browser UI for local exploration.

```bash
npx @stakme/mdf viewer TODO \
  --vpath docs \
  --port 4173
```

The viewer is what `mdf export` and `mdf docs` package into a static site.

## export <directory>

Produce a static copy of the viewer tailored to the selected files.

```bash
npx @stakme/mdf export TODO \
  --filter "status=done" \
  --output mdf-export
```

All matching documents are serialized under `api/documents/<id>/index.json`, and
referenced assets are copied into `documents/<id>/assets/`.

## docs [directory]

Shortcut for GitHub Pages documentation. Targets `./TODO`, writes to `./docs`,
and defaults to `--filter status=done`.

```bash
npm run docs:generate
```

Pass the same flags supported by `export` to customize filters, strictness, or
virtual path prefixes.

## run <alias>

Execute a named command defined in `.config/mdf.mts`.

```bash
npx @stakme/mdf run todo
```

Aliases reduce long command invocations into memorable shortcuts. They also keep
CI workflows consistent with what developers run locally.
