---
title: export
vpath: commands/Access Content
tags:
  - cli
  - reference
draft: false
chapter: 208
---

# export <directory>

Produce a static copy of the viewer tailored to selected files.

```bash
npx @stakme/mdf export TODO \
  --filter "status=done" \
  --output mdf-export
```

Matching documents are serialized under `api/documents/<id>/index.json`, and
referenced assets are copied into `documents/<id>/assets/`.

## Options

- `--output <directory>`: Target folder for the generated viewer (defaults to
  `mdf-export`).
- `--filter <expression>`: Apply one or more front‑matter filters to include
  only matching documents.
- `--vpath <prefix>`: Scope the export to a virtual-path subtree.
- `--repo-url <url>`: Base URL for repository links (for example,
  `https://github.com/acme/wiki/blob/main`).
- `--repo-icon <icon>`: Force the repository button icon (`github` or `gitlab`).
  Omit to auto-detect from `--repo-url`.
- `--strict`: Abort when files fail schema validation instead of logging
  warnings.
- `--ignore-invalid`: Skip unreadable Markdown files instead of halting the
  export.

## Repository links

When `--repo-url` is set, the viewer adds a “View on GitHub/GitLab” button that
deep-links to the current document. The export command appends each document’s
workspace-relative path to the URL you provide, so point it at the branch + root
folder that contains your Markdown.

```bash
npx @stakme/mdf export docs \
  --output public \
  --filter "draft=false" \
  --repo-url "https://github.com/stakme/markdfm/blob/main"
```

The example above produces links such as
`https://github.com/stakme/markdfm/blob/main/docs/100-overview.md`. Use
`--repo-icon gitlab` if the host cannot be inferred from the URL.
