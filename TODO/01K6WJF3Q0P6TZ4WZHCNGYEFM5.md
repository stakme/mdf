---
title: "`append` command"
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-06T10:53:21.538Z
updated_at: 2025-10-06T10:53:21.538Z
---

# `append` command

## What I need

I want to use image files for one of my notes. It will be useful if the command
creates a directory for images and appends them to the note.

## So I will create...

### `append` command

Add `append` command to append files to a note.

- Create a directory for images if it doesn't exist. The directory name is the
  same as the note name. For example, if the note is `docs/100-overview.md`, the
  directory name is `docs/100-overview/`.

- Move the file to the directory.
- Append an image tag to the note like `![alt](path/to/file)`.
