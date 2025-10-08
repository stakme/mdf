---
title: "Fix path resolution in viewer/export"
status: done
author: "@stakme"
tags: []
created_at: 2025-10-06T10:53:16.834Z
updated_at: 2025-10-07T22:31:03.899Z
---

# Fix path resolution in viewer/export

## What I need

Currently, `mdf list` and `mdf viewer` commands resolve paths relative to the
root directory of the workspace. For example, if I run the viewer in this
context, it hosts pages like `/#/docs/102-conf-guide`.

```
% node dist/cli.mjs list ./docs
./docs
├── commands
│   ├── List of commands (./docs/commands-overview.md)
│   ├── init (./docs/commands-init.md)
│   ├── new (./docs/commands-new.md)
│   ├── list (./docs/commands-list.md)
│   ├── validate (./docs/commands-validate.md)
│   ├── fix (./docs/commands-fix.md)
│   ├── update (./docs/commands-update.md)
│   ├── viewer (./docs/commands-viewer.md)
│   ├── export (./docs/commands-export.md)
│   ├── run (./docs/commands-run.md)
│   └── Filters and Virtual Paths (./docs/commands-filter-vpath.md)
├── recipes
│   └── Everyday Recipes (./docs/300-recipe.md)
├── Overview (./docs/100-overview.md)
├── Getting Started (./docs/101-getting-started.md)
├── Configuration Guide (./docs/102-conf-guide.md)
└── Change logs (./docs/400-changelogs.md)

% node dist/cli.mjs viewer ./docs
Viewer running at http://127.0.0.1:4173
```

But in this case, I want pages like `/#/102-conf-guide` that are resolved
relative to the specified directory.

## So I will create...

### viewer/export command

Fix path resolution logic in `mdf viewer` and `mdf export` commands.
