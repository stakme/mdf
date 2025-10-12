---
title: List output should be accessible paths if `--quiet` is passed
status: todo
author: "@stakme"
tags: []
created_at: 2025-10-12T00:17:03.241Z
updated_at: 2025-10-12T00:17:03.242Z
---

# List output should be accessible paths if `--quiet` is passed

## What I need

The `list` command should output accessible paths if `--quiet` is passed.

Currently, it outputs the relative paths to the directory passed to the command.
This is not very useful if the command is run from a different directory.

```bash
$ node dist/cli.mjs list --quiet ./docs            

01K7AW0YRM8TD6DSJ12XDY0RYX.md
01K7AW2SKXMNENW0CQ6BR4XG5B.md
100-overview.md
...
```

## So I will create...

### `list` command

The output of the `list` command should be accessible paths if `--quiet` is
passed.

```bash
$ node dist/cli.mjs list --quiet ./docs
./docs/01K7AW0YRM8TD6DSJ12XDY0RYX.md
./docs/01K7AW2SKXMNENW0CQ6BR4XG5B.md
./docs/100-overview.md
...
```
