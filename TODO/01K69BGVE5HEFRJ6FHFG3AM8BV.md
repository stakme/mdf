---
title: Hot reload viewer
status: done
author: "@stakme"
tags: []
created_at: 2025-09-28T23:46:24.354Z
updated_at: 2025-09-28T23:46:24.354Z
---

# Hot reload viewer

## What I need

When I run `mdf viewer`, I want it to watch markdown files in the directory and
reload the page when any file changes.

## So I will create...

### `viewer` command

This command will support hot reload by default.

```bash
mdf viewer --vpath blog --filter "status=done" ./docs
```
