# markdfm

> Organize Markdown knowledge bases with confident, schema-driven front matter.

`markdfm` helps teams and solo note-takers keep Markdown collections consistent. Define the
front matter schema you expect, scaffold new notes from templates, and audit existing files with a
single CLI.

## Highlights

- **Schema-first authoring** – enforce exactly the fields, defaults, and content rules you need.
- **Frictionless scaffolding** – spin up ready-to-edit Markdown files in one command.
- **Powerful querying** – filter notes by any front matter attribute and render custom output.
- **Confident maintenance** – validate or auto-fix drifted notes before they reach your repo.

## Installation

```bash
npm install --save-dev markdfm
# or
pnpm add -D markdfm
# or
yarn add -D markdfm
```

> **Node.js requirement:** markdfm targets Node 22 and newer.

Add the CLI to your package scripts or run it via `npx markdfm`.

## Quick start

1. **Create a config:** place `.config/markdfm.mts` anywhere under your workspace with a schema
   describing the front matter every file should include.
2. **Generate a note:** run `markdfm new <directory>` and provide overrides with `--fm` flags or a
   named template.
3. **Query your vault:** surface exactly the notes you need with `markdfm query` filters and custom
   output formats.

When you are ready to publish new notes, validate the collection with `markdfm validate` or
`markdfm fix`.

## CLI overview

| Command | Description |
| --- | --- |
| `markdfm new <directory>` | Scaffold Markdown files that match your schema and optional template defaults. |
| `markdfm query <directory>` | Inspect existing notes using front matter filters and rich output formatting. |
| `markdfm validate <directory>` | Confirm every file conforms to your schema, exiting non-zero when issues arise. |
| `markdfm fix <directory>` | Apply schema defaults and CLI overrides in-place to repair invalid notes. |

Run any command with `--help` for the full option list.

## Configuration

`markdfm` loads the closest `.config/markdfm.mts` file in the directory tree. Define your schema with
Zod and optional helpers:

```ts
import { defineConfig, z } from "markdfm/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                created_at: z.string().datetime().default(() => new Date().toISOString()),
                updated_at: z.string().datetime().default(() => new Date().toISOString()),
                status: z.enum(["todo", "in-progress", "done"]).default("todo"),
                tags: z.array(z.string()).default(() => []),
        }),
});
```

- `schema` must be a Zod object describing your front matter.
- `defaults` sets automatic fallback values for fields you omit when creating new notes.
- `content` (optional) can generate the Markdown body from template data.
- `fileName` (optional) lets you compute the file name from front matter values.

### Templates and overrides

Define named templates in your config to reuse curated defaults and starting content. Then apply them
on the CLI:

```bash
markdfm new notes --template meeting --fm tags=sync --fm attendees="Ada, Lin"
```

Templates layer their front matter on top of schema defaults, while `--fm key=value` flags win last.
Array fields support JSON-style values (`["release","planning"]`) or repeated flags.

## Query, format, and automate

Use the query command to slice your knowledge base and pipe the output to other tools:

```bash
markdfm query notes \
  --filter "status: todo" \
  --filter "tags: 'new feature'" \
  --format "[{{status}}] {{title}} ({{tags:, }})"
```

- Filters accept `field: value` syntax. Strings are case-insensitive and arrays match when **any**
  element equals the value.
- Target nested fields with dot notation, such as `project.status`.
- Customize the output template with front matter placeholders. Use `{{tags:, }}` to join array
  values, or include the relative file path via `{{file}}`.

## Keep notes trustworthy

Run validation before shipping changes, or automatically fix what you can:

```bash
markdfm validate notes
markdfm fix notes --fm status=todo --fm tags=backlog
```

- `validate` reports each valid file and exits with code `0` when everything passes.
- `fix` rewrites front matter safely, applying schema defaults and CLI overrides before writing.
- Both commands honor the file extension and defaults defined in your config.

## Programmatic usage

The package also exposes utilities for custom tooling. Import from `markdfm` or `markdfm/config`
inside build scripts, note-taking automations, or editor integrations to reuse the same schema and
helper functions as the CLI.

## Contributing

1. Clone the repo and install dependencies with `npm install`.
2. Run `npm run check`, `npm run build`, and `npm test` to verify changes.
3. Open a PR with updated docs and tests covering your improvements.

We welcome bug reports, feature requests, and documentation tweaks—open an issue to start the
conversation.

---

Ready to publish your Markdown knowledge base? Give `markdfm` a spin and keep every note consistent
from day one.
