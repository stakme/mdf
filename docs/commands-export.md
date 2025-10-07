---
title: export
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 208
---

# export <directory>

Produce a static copy of the viewer tailored to the selected files.

```bash
npx @stakme/mdf export TODO \
  --filter "status=done" \
  --output mdf-export
```

All matching documents are serialized under `api/documents/<id>/index.json`, and
referenced assets are copied into `documents/<id>/assets/`.
