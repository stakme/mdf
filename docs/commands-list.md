---
title: list
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 203
---

# list <directory>

Explore notes, apply filters, and render custom output.

```bash
npx @stakme/mdf list TODO \
  --filter "status=done" \
  --vpath docs \
  --format "[{{status}}] {{title}}"
```

`--format` swaps the tree view for templated one-line summaries. Dot notation
targets nested front matter fields, and the `f.` prefix disambiguates front
matter keys from reserved placeholders like `{{relpath}}`, `{{filename}}`, or
`{{file}}`.

```bash
npx @stakme/mdf list TODO --format "[{{f.status}}] {{relpath}}"
```

Heading placeholders expose the Markdown outline. Use `{{h1}}` through `{{h6}}`
to pull headings up to that depth. Headings join with newlines by default, and
you can provide a separator to override it.

```bash
npx @stakme/mdf list --format "[{{f.title}}] {{relpath}}\n{{h3}}" ./TODO
```

```
[Enhance `list` command] ./TODO/01K7BG5HSQ6SY0QDNT6594R9HA.md
# Enhance `list` command (L:10)
## What I need (L:12)
## So I will create... (L:17)
### list command (L:19)
```
