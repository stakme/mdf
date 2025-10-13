---
title: Getting Started
vpath: /
tags:
  - onboarding
  - docs
draft: false
chapter: 101
---

## Prerequisites

- [Node.js 22](https://nodejs.org/) or newer

## Install the CLI

Install the CLI with a package manager of your choice.
[I recommend `bunx`](https://bun.com/) but you can use any other package manager
for npm.

```bash
$ bunx install -g @stakme/mdf
```

## Scaffold configuration

Create `.config/mdf.mts` with a starter schema:

```bash
npx @stakme/mdf init
```

Edit the generated file to match your workflow. A minimal schema might look like
this:

```ts
import { defineConfig, z } from "@stakme/mdf/config";

export default defineConfig({
  schema: z.object({
    title: z.string(),
    status: z.enum(["todo", "in_progress", "done"]).default("todo"),
    vpath: z.string().optional(),
    tags: z.array(z.string()).default(() => []),
  }),
  virtualPath: { param: "vpath" },
});
```

You can define multiple schemas in a single config file for different paths. For
details, see the [Configuration Guide](/#/102-conf-guide) section.

## Create your first note

Use `mdf new` to scaffold Markdown that satisfies the schema. You can override
any default values with `--fm` flags (fm is an abbreviation for frontmatter).

```bash
npx @stakme/mdf new TODO \
  --fm title="Docs Overview" \
  --fm status=done \
  --fm vpath=docs/index
```

Open the file and edit the Markdown content.

## Validate the workspace

You may update and enhance your schema over time. Catch schema drift before with
`validate` command:

```bash
npx @stakme/mdf validate ./TODO
```

Fix issues in place via `npx @stakme/mdf fix TODO` or make targeted updates with
`mdf update`.

## List your notes

You can list your notes with `mdf list`:

```bash
npx @stakme/mdf list --filter "status=todo" ./TODO
```

Congratulations! You've created your knowledge base.
