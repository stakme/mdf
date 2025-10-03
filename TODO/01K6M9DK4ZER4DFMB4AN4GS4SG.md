---
title: "sort sidebar"
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-03T05:41:19.162Z
updated_at: 2025-10-03T05:41:19.163Z
---

# sort sidebar

## What I need

Current sidebar in viewer is sorted in each folder, but I cannot sort folders
and files as a whole. Also, files in root directory are evaluated as if they
have `./docs` vpath. It make it impossible to organize files as I want.

![image](./01K6M9DK4ZER4DFMB4AN4GS4SG/image.png)

## So I will create...

- Folders and files in the same level should be sorted as a whole. Because
  folder itself has no meta data, it should be evaluated as the first element of
  the folder.
- items in the root folder relative to specified directory should have `/`
  vpath.

```bash
# in this case, ./docs is the specified directory
npx @stakme/mdf viewer ./docs
```
