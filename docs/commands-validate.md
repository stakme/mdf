---
title: validate
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 204
---

# validate <directory>

Check every file against the schema. The command exits non-zero when problems
are detected so CI can block merges.

```bash
npx @stakme/mdf validate TODO
```
