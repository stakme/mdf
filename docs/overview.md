---
title: Overview
vpath: /
vslug: overview
tags:
  - docs
  - read this first
draft: false
chapter: 100
---

`mdf` is a lightweight CLI for developers who keep knowledge in Markdown tracked
by git.

Note: mdf 0.x is experimental and may change over time.

## What mdf does

`mdf` uses Markdown plus a small front‑matter block to organize knowledge in a
way that’s friendly to both humans and AI agents.

### Front matter

Front matter is a YAML block at the top of a file, separated from the body by a
blank line. It stores document metadata.

```mdx
---
title: Let's build a CLI to manage knowledge in Markdown files stored in git
status: todo
author: "@stakme"
updated_at: 2025-10-12T00:09:21.406Z
---

# Introduce code highlighting like GitHub
```

### Schema and validation

Define a schema per directory in the config file. Schemas make it easy to
organize, filter, validate, and publish notes without standing up a server.

```ts
docs: defineSchema({
  glob: "docs/**",
  schema: z.object({
    title: z.string().min(1).default("title"),
    description: z.string().optional(),
    tags: z.array(z.string()).default(() => []),
    draft: z.boolean().default(true),
    chapter: z.number().default(0),
    updated_at: z.date().default(() => new Date()),
  }),
  sort: (a, b) => a.chapter - b.chapter,
  visibleFields: ["tags"],
}),
```

### CLI workflows

Create, list, validate, update, and export notes from the CLI. Coding agents can
read the same workspace directly from disk. No MCP bridge or HTTP API required.

```bash
# Create a new file with front matter. 
# You can also use a template to seed the body.
$ npx @stakme/mdf new --fm 'title=something new' ./docs
docs/01K7AW2SKXMNENW0CQ6BR4XG5B.md

# List files by front‑matter filters.
$ npx @stakme/mdf list --filter "draft=true" ./docs
./docs
└── something new (./docs/01K7AW2SKXMNENW0CQ6BR4XG5B.md)

# Update an existing file’s front matter.
$ npx @stakme/mdf update --fm draft=false --fm updated_at docs/01K7AW2SKXMNENW0CQ6BR4XG5B.md
Updated ./docs/01K7AW2SKXMNENW0CQ6BR4XG5B.md
```

### Viewer and export

Preview notes in a local viewer, then export a static site. The page you’re
reading now is generated with the export command.

```bash
$ npx @stakme/mdf viewer ./docs
```

## Next steps

You can find more details in the following pages:

- [Getting Started](/#/getting-started): how to install and use mdf.
- [Why Front matter](/#/why-frontmatter): the reason why I choose front matter
  and create this project.
