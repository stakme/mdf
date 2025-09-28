---
title: Enhance `viewer` command
status: done
author: "@stakme"
tags: []
created_at: 2025-09-28T14:53:22.957Z
updated_at: 2025-09-28T21:01:58.000Z
---

# Enhance `viewer` command

## What I need

Current logic has a magic path to host `docs` directory, but `viewer` command
should be able to handle any directory to support multiple use cases.

## So I will create...

### `viewer` command

```bash
viewer --filter "status = todo" ./TODO
```

- `--filter` should support multiple conditions
- `--vpath` is not supported here, because `vpath` is used to organize pages.
