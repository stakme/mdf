---
title: Docs Overview
vpath: /
tags:
  - docs
draft: false
sortIndex: 1
---

# Docs Overview

`mdf` helps teams keep Markdown knowledge bases consistent, validated, and easy
to publish. These docs explain how to set up a workspace, manage notes, and
automate publishing to GitHub Pages using the built-in `docs` command.

## How the documentation is organized

- **Getting Started** covers installation, configuration, and the core authoring
  workflow.
- **CLI Reference** explains each command, recommended flags, and how commands
  work together.
- **Automation Guides** show how to export a docs site and wire it into CI,
  including the GitHub Pages workflow shipped in this repo.
- **Recipes** gather common day-to-day tasks like grooming TODO queues or
  preparing release notes.

Each page lives in the `/TODO` directory with `status=done` and a `vpath`
beginning with `docs/`. Running `mdf docs` exports just those completed entries
to the `/docs` folder for GitHub Pages.

## Key capabilities to know about

- **Schema-driven authoring:** every note is validated against
  `.config/mdf.mts`, so front matter stays predictable.
- **Virtual paths:** the `vpath` field builds the navigation tree you see in the
  viewer and the exported site.
- **Asset friendly:** embed screenshots and diagrams with relative paths; the
  exporter rehosts them per document.
- **Filters and automation:** combine `--filter` and `--vpath` to target subsets
  of notes for listing, validation, or export.

Use this overview as the jumping-off point—move to Getting Started next if you
are brand-new, or straight to CLI Reference when you just need command syntax.
