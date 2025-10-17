---
title: Batch retagging
vpath: /recipes
tags:
  - recipes
  - workflows
draft: false
chapter: 330
---

Sometimes you need to update multiple files at once. Here's a recipe for batch
retagging:

```bash
npx @stakme/mdf list TODO --filter "tags~=legacy" --format "{{abspath}}" \
  | xargs -I{} npx @stakme/mdf update {} --fm tags='["deprecated"]'
```

Use list formatting helpers to emit file paths, then feed them into `mdf update`
that takes a file path and updates its frontmatter in place.
