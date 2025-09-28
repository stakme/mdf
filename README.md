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

## Querying notes

Explore existing Markdown files by filtering their front matter:

```bash
markdfm query notes \
  --filter "status: todo" \
  --filter "tags: 'new feature'" \
  --format "[{{status}}] {{title}} ({{tags:, }})"
```

Key details:

- Each `--filter` expects `field: value`. Strings are case-insensitive, and arrays match when *any* element equals the value. Numbers and booleans are parsed automatically; wrap strings with spaces in quotes.
- Use dot notation (e.g. `project.status`) to target nested front matter fields. Filters must all pass for a file to appear in the results.
- The output template defaults to `{{title}}`. Insert any front matter value with `{{field}}`, join array values with a custom separator using `{{tags:, }}`, and emit the relative file path with `{{file}}`.
- Results are printed in the order files are discovered, making it easy to pipe the output to other tools.

## Validating notes

Audit existing files against your schema to catch drift:

```bash
markdfm validate notes
```

- Reports each valid file and exits with `0` when all front matter passes validation.
- Prints errors per file when issues are found and exits with `1` so CI can fail fast.
- Honors the same file extension configured via `.config/markdfm.mts`.

## Fixing notes

Patch files in-place by filling in missing or invalid values:

```bash
markdfm fix notes --fm status=todo --fm tags=backlog
```

- Applies your schema defaults and any `--fm` overrides before rewriting front matter.
- Skips files it cannot fix automatically, listing each problem at the end and exiting with `1` so you can review them manually.
- Uses the same parser as `validate`, ensuring fixes keep data conformant.
