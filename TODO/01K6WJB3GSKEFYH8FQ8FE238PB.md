---
title: Remove 'Created' from output of 'new' command
status: done
author: "@stakme"
tags: []
created_at: 2025-10-06T10:51:10.267Z
updated_at: 2025-10-06T10:51:10.267Z
---

# Remove 'Created' from output of 'new' command

## What I need

Currently `new` outputs a message `Created <path>`.

```bash
% node dist/cli.mjs new ./TODO                     
Created TODO/01K6WJB3GSKEFYH8FQ8FE238PB.md
```

I want to open the created file in Windsurf, so output should be just the path
to the created file.

```bash
# If `new` outputs a path to the created file,
% node dist/cli.mjs new ./TODO
TODO/01K6WJFV96E0GVKP84P5T4B4TS.md

# Then I can open it easily in IDEs like Windsurf
windsurf $(node dist/cli.mjs new ./TODO)
```

## So I will create...

- Remove `Created` from output of `new` command.
