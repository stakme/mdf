---
title: Link by Frontmatter field
status: done
author: "@stakme"
tags: []
created_at: 2025-09-29T23:10:50.278Z
updated_at: 2025-09-30T05:17:30.000Z
---

# Link by Frontmatter field

## What I need

- I want to link to other documents by frontmatter field. For example, I want to
  link to other documents by `tags` field.

## So I will create...

### `viewer` command

- Support link by frontmatter field. The server also should host a dedicated
  page for each field values. If a `tags` field is defined, the server should
  host `/fm/tags`, `/fm/tags/foobar`, `/fm/tags/foobaz`, etc. Each page should
  show documents that have the same field value.
