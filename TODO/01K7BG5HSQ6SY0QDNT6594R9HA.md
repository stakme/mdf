---
title: "Enhance `list` command"
status: todo
author: "@stakme"
tags: [a,b,c]
created_at: 2025-10-12T06:01:47.605Z
updated_at: 2025-10-12T06:01:47.606Z
---

# Enhance `list` command

## What I need

- I want to list files with its headlines.
- I want to use special characters to format the list output.

## So I will create...

### list command

- `list` command to list files with specified front matter.
- It shows headers in level 1 to 3 when I pass `--format "{{title}}\n{{h3}}"`.
- support `{{h1}}`, `{{h2}}`, `{{h3}}`, `{{h4}}`, `{{h5}}`, `{{h6}}`
  placeholders.

```bash
$ npx @stakme/mdf list --format "[{{f.title}}] {{relpath}}\n{{h3:\n}}" ./TODO

[Enhance `list` command] ./TODO/01K7BG5HSQ6SY0QDNT6594R9HA.md
# Enhance `list` command (L:10)
## What I need (L:12)
## So I will create... (L:17)
### list command (L:19)
```

### docs

- update `list` command docs.
- Add examples for exisiting options like `relpath` and `f.` prefix.
