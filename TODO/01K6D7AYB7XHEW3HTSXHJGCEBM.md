---
title: "`list --quiet` does not show file extensions"
status: done
author: "@stakme"
tags: []
created_at: 2025-09-30T11:50:14.145Z
updated_at: 2025-09-30T11:50:14.146Z
---

# `list --quiet` does not show file extensions

## What I need

- I expect `list --quiet` to show file extensions, but it doesn't.

```bash
npx @stakme/mdf list --quiet ./TODO 
01998df2-6064-771f-9b61-659ffbfd49f5
01998e00-424c-7996-b61b-2590d9e7cdd4
```

## So I will create...

### `list` command

- It should show relative paths to the directory instead of IDs.
