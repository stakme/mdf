---
title: Everyday Recipes
vpath: /recipes
tags:
  - recipes
  - workflows
draft: false
chapter: 300
---

# Everyday Recipes

Short, repeatable workflows that help you keep notes fresh and documentation up
to date.

## Promote a note to docs

```bash
npx @stakme/mdf update ./TODO/<file>.md \
  --fm status=done \
  --fm updated_at
```

Add or adjust the `vpath` to place the note inside the docs navigation.
Regenerate the site with `npm run docs:generate`.

## Reorganize navigation

```bash
npx @stakme/mdf update ./TODO/<file>.md --fm vpath=docs/commands/advanced
```

Run `mdf list --vpath docs` to confirm the tree looks right before exporting.

## Batch retagging

```bash
npx @stakme/mdf list TODO --filter "tags~=legacy" --format "{{paths.absolutePath}}" \
  | xargs -I{} npx @stakme/mdf update {} --fm tags='["deprecated"]'
```

Use the list formatting helpers to emit file paths, then feed them into
`mdf update` for targeted edits.

## Capture a regression test idea

```bash
npx @stakme/mdf new TODO \
  --fm title="[Test] Viewer handles empty tags" \
  --fm status=todo \
  --fm vpath=qa/regressions \
  --fm tags='["test"]'
```

Keep unfinished work out of the docs export by leaving `status=todo`. When the
fix lands, flip the status to `done` and move the `vpath` under `docs/` to
publish a write-up.

## Prepare release notes

```bash
npx @stakme/mdf list TODO \
  --filter "status=done" \
  --filter "tags~=release" \
  --format "- {{updated_at}} {{title}}"
```

The command gives you a changelog-ready bullet list ordered by the dates in your
notes. Copy the output into `CHANGELOG.md` and tailor the wording.

## Clean up stale drafts

```bash
npx @stakme/mdf list TODO \
  --filter "status=todo" \
  --filter "created_at^=2024" \
  --format "{{title}} ({{paths.relativePath}})"
```

Review dormant work and either finish it or archive the file. Keeping the queue
short makes it easier to spot docs that are ready to publish.
