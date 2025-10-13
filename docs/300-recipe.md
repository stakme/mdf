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

Short, repeatable workflows to keep notes fresh and docs up to date.

## Promote a note to docs

```bash
npx @stakme/mdf update ./TODO/<file>.md \
  --fm status=done \
  --fm updated_at
```

Add or adjust `vpath` to place the note in the docs navigation, then run `npm run docs:generate`.

## Reorganize navigation

```bash
npx @stakme/mdf update ./TODO/<file>.md --fm vpath=docs/commands/advanced
```

Run `mdf list --vpath docs` to confirm the tree before exporting.

## Batch retagging

```bash
npx @stakme/mdf list TODO --filter "tags~=legacy" --format "{{paths.absolutePath}}" \
  | xargs -I{} npx @stakme/mdf update {} --fm tags='["deprecated"]'
```

Use list formatting helpers to emit file paths, then feed them into `mdf update`.

## Capture a regression test idea

```bash
npx @stakme/mdf new TODO \
  --fm title="[Test] Viewer handles empty tags" \
  --fm status=todo \
  --fm vpath=qa/regressions \
  --fm tags='["test"]'
```

Leave `status=todo` to keep drafts out of the docs export. Flip to `done` and move the `vpath` under `docs/` when you’re ready to publish.

## Prepare release notes

```bash
npx @stakme/mdf list TODO \
  --filter "status=done" \
  --filter "tags~=release" \
  --format "- {{updated_at}} {{title}}"
```

Paste the bullet list into `CHANGELOG.md` and tailor the wording.

## Clean up stale drafts

```bash
npx @stakme/mdf list TODO \
  --filter "status=todo" \
  --filter "created_at^=2024" \
  --format "{{title}} ({{paths.relativePath}})"
```

Review dormant work and either finish it or archive the file. Keeping the queue short makes it easy to spot notes ready to publish.

