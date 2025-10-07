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
targets nested front matter fields.
