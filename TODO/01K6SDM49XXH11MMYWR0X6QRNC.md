---
title: "`new` command should respect schema for specific directory"
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-05T05:30:59.800Z
updated_at: 2025-10-05T05:30:59.800Z
---

# `new` command should respect schema for specific directory

## What I need

`new` command should respect schema for specific directory. But currently, we
have multiple issues:

1. schema file cannot express the priority of schema.

Assume we have this schema.

```ts
schema: {
    docs: defineSchema({
        glob: "docs/**",
        schema: z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            vpath: z.string().min(1),
            date: z.iso.date().optional(),
            tags: z.array(z.string()).default(() => []),
            draft: z.boolean().default(false),
            chapter: z.number(),
        }),
        sort: (a, b) => a.chapter - b.chapter,
    }),
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
    }),
},
```

Becahse `schema` is an object, it cannot express the priority of schema. So we
have to update `defaultSchema` to express the priority of schema.

2. `new` command should respect schema for specific directory.

If we run `new` command in `docs` directory, it should use `docs` schema.

```bash
% node dist/cli.mjs new ./docs
```

## So I will create...

- update `defaultSchema` to express the priority of schema.
- update `new` command to respect schema for specific directory.
- update tests for `new` command.
