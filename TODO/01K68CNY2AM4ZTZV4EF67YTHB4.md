---
title: Fix config type definitions
status: done
author: "@stakme"
tags: []
created_at: 2025-09-28T14:47:25.025Z
updated_at: 2025-09-28T15:03:46.118Z
---

# Fix config type definitions

## What I need

`.config/mdf.mts` shows a conflict: we have multiple schema but templates cannot
specify which schema to use. We should allow templates to specify a schema.

## So I will create...

### .config/mdf.mts

```ts
import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
    schema: [
        {
            name: "docs",
            glob: "docs/**",
            schema: z.object({
                title: z.string().min(1),
                vpath: z.string().optional(),
                description: z.string().optional(),
            }),
        },
        {
            name: "default",
            glob: "**",
            schema: z.object({
                title: z.string().min(1),
                vpath: z.string().optional(),
                status: z.enum(["todo", "in_progress", "done"]).default("todo"),
            }),
        },
    ],

    templates: {
        default: {
            schema: "default", // <--- THIS
            body: ({ title }) => `# ${title}`,
        },
    },
});
```
