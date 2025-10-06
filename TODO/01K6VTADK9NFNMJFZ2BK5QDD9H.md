---
title: Customizing footer in viewer/export
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-06T03:51:21.994Z
updated_at: 2025-10-06T03:51:21.995Z
---

# Customizing footer in viewer/export

## What I need

- I want to display specific front matter fields in footer. Fileds like
  `draft=false` should not be visible.

## So I will create...

### .config/mdf.mts

Add `visibleFields` to schema.

```ts
docs: defineSchema({
    glob: "docs/**",
    schema: z.object({
        title: z.string().min(1).default("title"),
        description: z.string().optional(),
        vpath: z.string().min(1).default("/"),
        date: z.iso.date().optional(),
        tags: z.array(z.string()).default(() => []),
        draft: z.boolean().default(false),
        chapter: z.number().default(0),
    }),
    sort: (a, b) => a.chapter - b.chapter,
    visibleFields: ["title", "description", "vpath", "date", "tags", "draft", "chapter"],
}),
```

### viewer/export

- Reflect `visibleFields` to footer. If no fields are specified, display no
  footer.
- Rename `Front matter` to `List of fields`.
