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
publish Markdown notes. Each command has its own focused page under
`commands/<name>`. Use `--help` on any command for full options.

## Command index

- `init`: Scaffold a starter `.config/mdf.mts`.
- `new <directory>`: Create a file from templates and schema defaults.
- `append <note> <files...>`: Move assets into a note and append image tags.
- `list <directory>`: Filter and format collections.
- `validate <directory>`: Verify front matter against your schema.
- `fix <directory>`: Apply defaults and CLI overrides safely.
- `update <files...>`: Edit front matter on specific files.
- `viewer <directory>`: Explore documents locally in a browser UI.
- `export <directory>`: Produce a static viewer for selected files.
- `docs [directory]`: Shortcut for a GitHub Pages–ready export.
- `run <alias>`: Execute a configured alias from `.config/mdf.mts`.
