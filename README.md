# markdfm
Lightweight utility to organize Markdown files with front matter

## Configuring

Create `.config/markdfm.mts` anywhere under your workspace and export a schema:

```ts
import { defineConfig, z } from "markdfm/config";

export default defineConfig({
	schema: z.object({
		title: z.string(),
		created_at: z.string().datetime().default(() => new Date().toISOString()),
		updated_at: z.string().datetime().default(() => new Date().toISOString()),
	}),
});
```

The schema can be any Zod object. Optional helpers allow you to provide `defaults`,
`content`, or `fileName` functions for richer automation.

## Creating notes

Use the CLI to scaffold new Markdown files with valid front matter:

```bash
markdfm new notes
markdfm new notes --fm title="Release Plan" --fm created_at="2025-09-27"
```

The command validates all provided fields using your schema, fills in a
`created_at` timestamp when the schema requires it, and writes a Markdown file
with front matter to the target directory.
