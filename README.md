# markdfm

> Organize Markdown knowledge bases with confident, schema-driven front matter.

`markdfm` helps teams and solo note-takers keep Markdown collections consistent. Define the
front matter schema you expect, scaffold new notes from templates, and audit existing files with a
single CLI.

## Highlights

- **Schema-first authoring** – enforce exactly the fields, defaults, and content rules you need.
- **Frictionless scaffolding** – spin up ready-to-edit Markdown files in one command.
- **Smart filtering** – slice notes by front matter attributes and render tailored output.
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
3. **Surface the right notes:** explore your collection with `markdfm list` filters, virtual-path
   scoping, and custom output formats.

When you are ready to publish new notes, validate the collection with `markdfm validate` or
`markdfm fix`.

## CLI overview

| Command | Description |
| --- | --- |
| `markdfm new <directory>` | Scaffold Markdown files that match your schema and optional template defaults. |
| `markdfm list <directory>` | Inspect existing notes with virtual-path trees, filters, and custom output templates. |
| `markdfm validate <directory>` | Confirm every file conforms to your schema, exiting non-zero when issues arise. |
| `markdfm fix <directory>` | Apply schema defaults and CLI overrides in-place to repair invalid notes. |
| `markdfm run <alias> [args...]` | Execute a configured alias that expands to another `markdfm` command. |

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
- `aliases` (optional) map friendly names to frequently used CLI command fragments for `markdfm run`.

### Templates and overrides

Define named templates in your config to reuse curated defaults and starting content. Then apply them
on the CLI:

```bash
markdfm new notes --template meeting --fm tags=sync --fm attendees="Ada, Lin"
```

Templates layer their front matter on top of schema defaults, while `--fm key=value` flags win last.
Array fields support JSON-style values (`["release","planning"]`) or repeated flags.

## List, filter, and automate

Use the list command to slice your knowledge base and pipe the output to other tools:

```bash
markdfm list notes
markdfm list --vpath backlog notes
markdfm list notes \
  --filter "status=todo" \
  --filter "tags~=feature" \
  --format "[{{status}}] {{title}} ({{tags:, }})"
```

- `markdfm list` shows a virtual-path tree by default. Configure `virtualPath.param` in your config
  and pass `--vpath <prefix>` to narrow the tree to matching paths.
- Provide `--filter` expressions with `=` (or `:`), `~=`, `^=`, or `$=` operators for exact,
  substring, prefix, or suffix matching. Arrays match when **any** element satisfies the filter.
- Target nested front matter fields with dot notation, such as `project.status`.
- Supply `--format` to bypass the tree and render each match with `{{field}}` placeholders. Use
  helpers like `{{tags:, }}` to join arrays or `{{paths.relativePath}}` for the file location.

### Aliases and shortcuts

Store your favorite command combinations in the config and run them with a short name:

```ts
import { defineConfig, z } from "markdfm/config";

export default defineConfig({
        schema: z.object({
                title: z.string(),
                status: z.enum(["todo", "in_progress", "done"]),
                vpath: z.string(),
        }),
        virtualPath: {
                param: "vpath",
        },
        aliases: {
                todo: 'list --filter "status=todo" ./TODO',
        },
});
```

```bash
markdfm run todo
```

`markdfm run` expands the alias value into a fresh CLI invocation, so all built-in commands and
flags work as if you typed them manually. Aliases can reference other aliases, and the CLI detects
cycles to prevent infinite recursion.

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
