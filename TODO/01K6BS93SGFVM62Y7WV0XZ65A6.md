---
title: Show enabled options in viewer
status: todo
author: "@stakme"
tags: []
created_at: 2025-09-29T22:25:19.693Z
updated_at: 2025-09-29T22:25:19.694Z
---

# Show enabled options in viewer

## What I need

When I run `viewer` command with options like this,

```bash
npx @stakme/mdf viewer --filter "status = done" ./TODO
```

I want to see the enabled options in the viewer. The current header shows only a
path to the directory.

## So I will create...

### `viewer` command

- Show enabled options in the viewer header along with the directory path
