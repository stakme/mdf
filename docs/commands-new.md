---
title: new
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 202
---

# new <directory>

Scaffold Markdown that conforms to your schema.

```bash
npx @stakme/mdf new TODO \
  --template default \
  --fm title="Investigate viewer" \
  --fm tags='["research"]'
```

Combine templates with `--fm` overrides for repeatable structures.

