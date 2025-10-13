---
title: update
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 206
---

# update <files...>

Apply targeted front‑matter updates without touching the Markdown body.

```bash
npx @stakme/mdf update ./TODO/01ABC.md \
  --fm status=done \
  --fm updated_at
```

Omitting a value (as with `updated_at`) regenerates it using the schema default.

