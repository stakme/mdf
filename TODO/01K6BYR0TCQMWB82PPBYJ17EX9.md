---
title: "`--quiet` flag in `list` command"
status: todo
author: "@stakme"
tags: []
created_at: 2025-09-30T00:00:51.050Z
updated_at: 2025-09-30T00:00:51.051Z
---

# `--quiet` flag in `list` command

## What I need

- I want to retrieve a list of documents from the collection. It will be useful
  to update files in bulk.
- docker CLI provides `-q` flag to print only IDs and we can use it as
  `docker rm $(docker ps -q)`. I want to have a similar flag in `list` command.

## So I will create...

### `list` command

- Add `-q` flag to `list` command. When `-q` flag is provided, the command
  should print only IDs.
