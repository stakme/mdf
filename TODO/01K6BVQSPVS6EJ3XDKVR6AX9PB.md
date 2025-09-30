---
title: No error with no valid documents
status: done
author: "@stakme"
tags: []
created_at: 2025-09-29T23:08:18.042Z
updated_at: 2025-09-29T23:08:18.043Z
---

# No error with no documents

## What I need

- I wouldn't expect an error even when there are no valid documents.

## So I will create...

### `.viewer` command

- Don't throw error when there are no documents. The server should show a empty
  page.
- Also, because purpose of `viewer` command is to display as many documents as
  possible, it should show all documents with no valid front matters by default.
- Add `--ignore-invalid` option to ignore invalid documents explicitly.
