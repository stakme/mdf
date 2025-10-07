---
title: Overview
vpath: /
vslug: overview
tags:
  - docs
draft: false
chapter: 100
---

# Docs Overview

> 🎉 **mdf 1.0** is here! The CLI, viewer, and docs toolchain are now polished
> for everyday teams who need predictable Markdown collections and a slick
> sharing experience.

`mdf` helps teams keep Markdown knowledge bases consistent, validated, and easy
to publish. These docs explain how to stand up a workspace, coach contributors,
and ship a GitHub Pages site without leaving the terminal.

## What's new in 1.0.0

- **Unified quality gates.** Every command—from `init` and `new` to `validate`,
  `fix`, and `update`—works together to enforce your schema and keep notes
  trustworthy.
- **Built-in sharing.** Launch the interactive viewer locally or export it as a
  static site tailored to your filters with `mdf export` and `mdf docs`.
- **Release-ready guidance.** Maintainers get SemVer rules, checklists, and
  quality bars in `AGENTS.md` so future releases stay predictable.

## How the documentation is organized

- **Getting Started** covers installation, configuration, and the core authoring
  workflow.
- **Commands** documents each CLI command with focused pages under `commands/`,
  including examples and recommended flags.
- **Automation Guides** show how to export a docs site and wire it into CI,
  including the GitHub Pages workflow shipped in this repo.
- **Recipes** gather common day-to-day tasks like grooming TODO queues or
  preparing release notes.

Each page lives in the `/TODO` directory with `status=done` and a `vpath`
beginning with `docs/`. Running `mdf docs` exports just those completed entries
to the `/docs` folder for GitHub Pages.

## Choose your next step

- New to `mdf`? Start with **Getting Started** to set up your first workspace.
- Need syntax fast? Jump into **Commands**.
- Planning a release? Review the refreshed **Change logs** page for templates
  and storytelling tips.

## Aliases at a glance

Use `aliases` in `.config/mdf.mts` to shorten frequently used commands and keep
local scripts aligned with CI. Define them in the config, then run with
`mdf run <alias>`. See the Configuration Guide’s Aliases section for examples
and cycle detection behavior.
