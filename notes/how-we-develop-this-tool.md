---
title: How we develop this tool
vpath: /notes
tags:
draft: false
chapter: 340
---

Our development workflow keeps humans and AI assistants aligned while we ship
changes through `mdf`.

## Capture work with TODO tickets

All incoming work starts as a ticket inside the `TODO/` directory. Use the
`new` command (optionally with a template) to spin up a brief that captures the
request, constraints, and planned deliverables:

```bash
npx @stakme/mdf new ./TODO
```

Tickets are intentionally named with opaque identifiers so file paths never
encode meaning. Instead, each Markdown file carries front matter fields like
`title`, `status`, and `tags` to describe the task.

## Draft the plan inside the brief

Open the generated Markdown file and document the problem, desired outcome, and
any checkpoints. The author typically sketches an outline under sections such as
“What I need” and “So I will create…” to guide the implementation.

Updating the brief ensures AI collaborators have all the context they need
before writing code or docs.

## Track progress with list + aliases

Use the `list` command to review open work. We prefer filter expressions over
bespoke options:

```bash
npx @stakme/mdf list --filter "status=todo" ./TODO
```

For convenience, define aliases in `mdf.mts`—for example `todo`—so the same
query is one keystroke away:

```bash
npx @stakme/mdf run todo
```

The output makes it easy to copy a single line (e.g.
`Reduce complexity of list command (./TODO/1760751416725.md)`) and feed it into
Codex or another assistant.

## Collaborate through Codex

Codex operates in a cloud workspace. Paste the selected ticket line, then allow
Codex to modify the repository. Codex edits both source files and the ticket
itself so history stays self-documenting.

## Review, test, and commit

Once changes are ready, review the diff locally. Run quality gates—formatters,
type checks, builds, and tests—to keep the project healthy. When the work meets
our standards, create a commit that references the completed ticket.

## Close out the ticket

After merging, mark the ticket as done so future `list` calls stay focused on
what remains:

```bash
npx @stakme/mdf update ./TODO/1760751703954.md --fm status=done --fm updated_at
```

Keeping the brief updated as the single source of truth prevents context drift
between humans and AI teammates and ensures every change tells its own story.
