---
title: Introduce `strict` option and ignore invalid markdfm files by default
status: todo
author: "@stakme"
tags: []
created_at: 2025-09-29T22:27:59.843Z
updated_at: 2025-09-29T22:27:59.844Z
---

# Introduce `strict` option and ignore invalid markdfm files by default

## What I need

I want to ignore invalid markdfm files by default. It is enough to show an
warning message when there are invalid files in common case.

## So I will create...

- Modify `list`, `viewer` and `update` commands to ignore invalid markdfm files
  by default.
- Introduce `strict` option to `list`, `viewer` and `update` commands to fail
  when there are invalid files.
