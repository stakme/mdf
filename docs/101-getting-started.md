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

`mdf 0.x` is designed to get a Markdown knowledge base production-ready in a
single afternoon. Follow this guide the first time you install the CLI, then
lean on the recipes and reference docs for day-to-day work.

> 💡 Tip: Keep the [Docs Overview](./01K6M8E4A1M4CS4XW7M2MZVQG2.md) open in
> another tab so you can hop between guides as you explore.

## Prerequisites

- Node.js 22 or newer.
- A Git repository (recommended) to track Markdown changes and docs output.
- A directory, such as `TODO/`, where your Markdown notes will live.

## Install the CLI

```bash
npm install --save-dev @stakme/mdf
```

Add a convenience script to `package.json` if you run the CLI often:

```json
{
  "scripts": {
    "mdf": "mdf"
  }
}
```

Now you can launch commands with `npx @stakme/mdf` or
`npm run mdf -- <command>`.

## Scaffold your configuration

Create `.config/mdf.mts` with the schema you want to enforce:

```bash
npx @stakme/mdf init
```

Edit the generated file to match your workflow. A minimal queue schema might
look like this:

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

Use `mdf new` to scaffold Markdown that satisfies the schema. Set `status=done`
for anything you want exported to docs right away.

```bash
npx @stakme/mdf new TODO \
  --fm title="Docs Overview" \
  --fm status=done \
  --fm vpath=docs/index
```

Open the generated file to add Markdown content. The `vpath` determines the
navigation tree in the viewer and exported site.

## Validate the workspace

Before publishing, catch schema drift with:

```bash
npx @stakme/mdf validate TODO
```

Fix issues in place via `npx @stakme/mdf fix TODO` or targeted updates with
`mdf update`.

## Generate docs when ready

The GitHub Pages workflow runs the same steps you can trigger locally:

```bash
npm run build
npm run docs:generate
```

The docs export copies the viewer assets into `/docs`, serializes metadata for
every `status=done` entry, and rehosts linked assets so the static site works
without a server.

## Preview in the viewer

Before sharing the static site, open the interactive viewer to sanity-check
navigation, filters, and document rendering:

```bash
npx @stakme/mdf viewer TODO --vpath docs --port 4173
```

The viewer mirrors the exported experience, so anything that looks right here
will look right in production.

## Launch checklist

- [ ] Install dependencies and initialize `.config/mdf.mts`.
- [ ] Scaffold at least one note with `mdf new`.
- [ ] Validate and fix drift before exporting.
- [ ] Preview in the viewer, then run `mdf docs` to produce the site.

## What to read next

Head to the Commands section for command details or open the GitHub Pages
Automation guide to understand the deployment workflow.
