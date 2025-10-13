---
title: Customizing filename in `new` command
status: done
author: "@stakme"
tags: []
created_at: 2025-10-12T08:17:30.185Z
updated_at: 2025-10-12T08:17:30.186Z
---

# Customizing filename in `new` command

## What I need

In some projects, I want to name files following specific patterns. It will be
useful to have an option to customize the filename in `new` command.

## So I will create...

### .config/mdf.mts

- deprecate `idGenerator` option.
- add `filenameGenerator` option in schema to generate filename from front
  matter like `body` option in template

```ts
default: defineSchema({
    glob: "**",
    schema: z.object({
        title: z.string(),
        vpath: z.string().optional(),
        status: z.enum(["todo", "in_progress", "done"]).default("todo"),
        author: z.string().optional(),
        tags: z.array(z.string()).default(() => []),
        created_at: z.iso.datetime().default(() => new Date().toISOString()),
        updated_at: z.iso.datetime().default(() => new Date().toISOString()),
    }),
    sort: (a, b) => a.created_at.localeCompare(b.created_at),
    filenameGenerator: (fm) => `${fm.title}.md`,
}),
```

### new command

- add `--filename` option to `new` command. If provided, use it as filename. If
  there is already a file with the same name, throw an error.
- Use `filenameGenerator` option to generate filename when `--filename` option
  is not provided
- Use `ulid` as default when `filenameGenerator` is not provided
