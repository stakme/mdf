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
		tags: z.array(z.string()).default(() => []),
	}),
});
```

The schema can be any Zod object. Optional helpers allow you to provide `defaults`,
`content`, or `fileName` functions for richer automation.

## Creating notes

Use the CLI to scaffold new Markdown files with valid front matter:

```bash
markdfm new notes
markdfm new notes --fm title="Release Plan" --fm tags=["release","planning"]
markdfm new notes --fm title="Release Plan" --fm tags=release --fm tags=planning
```

The command validates all provided fields using your schema, applies any
defaults you define, and writes a Markdown file with front matter to the target
directory. Array fields accept either a JSON-like literal or multiple
`--fm key=value` flags to accumulate values.
