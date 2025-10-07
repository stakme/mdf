---
title: List of commands
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 200
---

# List of commands

`mdf` ships subcommands that work together to scaffold, inspect, repair, and
publish Markdown notes. Each command now has its own focused page under
`commands/<name>`. Run any command with `--help` for the exhaustive option list.

## Command index

- `init` — Scaffold a starter `.config/mdf.mts`.
- `new <directory>` — Create a file from templates and schema defaults.
- `list <directory>` — Filter and format collections.
- `validate <directory>` — Verify front matter against your schema.
- `fix <directory>` — Apply defaults and CLI overrides safely.
- `update <files...>` — Edit front matter on specific files.
- `viewer <directory>` — Explore documents locally in a browser UI.
- `export <directory>` — Produce a static viewer for selected files.
- `docs [directory]` — Shortcut for GitHub Pages–ready docs export.
- `run <alias>` — Execute a configured alias from `.config/mdf.mts`.
