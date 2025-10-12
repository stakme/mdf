---
title: Link for Markdown files is not readable
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-12T02:32:31.188Z
updated_at: 2025-10-12T02:32:31.188Z
---

# Link for Markdown files is not readable

## What I need

In current viewer app, link for Markdown files is not readable.

- HTML: http://127.0.0.1:4173/#/overview
- Markdown: http://127.0.0.1:4173/documents/MTAwLW92ZXJ2aWV3Lm1k/index.md

We already introduced unique paths for each pages like `#/overview`, so we
should use the same pattern for Markdown files.

## So I will create...

### viewer/export

- [ ] Introduce unique paths for each Markdown files
