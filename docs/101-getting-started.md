---
title: Getting Started
vpath: /
tags:
  - onboarding
  - docs
draft: false
chapter: 101
---

# Getting Started

`mdf 0.x` helps you take a Markdown knowledge base from zero to production in an afternoon. Use this guide for your first setup, then lean on recipes and reference docs for daily work.

Tip: Keep the Docs Overview open in another tab so you can jump between guides.

## Prerequisites

- Node.js 22 or newer
- A Git repository (recommended) to track Markdown and generated docs
- A directory—such as `TODO/`—for your notes

## Install the CLI

```bash
npm install --save-dev @stakme/mdf
```

Add a convenience script to `package.json` if you’ll run it often:

```json
{
  "scripts": {
    "mdf": "mdf"
  }
}
```

Now invoke commands with `npx @stakme/mdf` or `npm run mdf -- <command>`.

## Scaffold configuration

Create `.config/mdf.mts` with a starter schema:

```bash
npx @stakme/mdf init
```

Edit the generated file to match your workflow. A minimal queue schema might look like this:

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

## Create your first note

Use `mdf new` to scaffold Markdown that satisfies the schema. Set `status=done` for anything you want exported to docs right away.

```bash
npx @stakme/mdf new TODO \
  --fm title="Docs Overview" \
  --fm status=done \
  --fm vpath=docs/index
```

Open the file and add Markdown content. The `vpath` controls navigation in the viewer and static site.

## Validate the workspace

Catch schema drift before publishing:

```bash
npx @stakme/mdf validate TODO
```

Fix issues in place via `npx @stakme/mdf fix TODO` or make targeted updates with `mdf update`.

## Generate docs

The GitHub Pages workflow runs the same steps you can try locally:

```bash
npm run build
npm run docs:generate
```

The export copies viewer assets into `/docs`, serializes metadata for each `status=done` entry, and rehosts assets so the site works without a server.

## Preview in the viewer

Sanity‑check navigation, filters, and rendering before you ship:

```bash
npx @stakme/mdf viewer TODO --vpath docs --port 4173
```

What looks right here will look right in production.

## Launch checklist

- [ ] Install dependencies and initialize `.config/mdf.mts`.
- [ ] Scaffold at least one note with `mdf new`.
- [ ] Validate and fix drift before exporting.
- [ ] Preview in the viewer, then run `mdf docs` to produce the site.

## Next steps

Head to the Commands section for details, or open the GitHub Pages automation guide to see how deployment works.

