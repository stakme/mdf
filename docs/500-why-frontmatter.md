---
title: Why front matter
vpath: /notes
tags:
  - blog
  - read this first
draft: false
chapter: 500
---

In a fast‑moving AI era, tools come and go; plain text endures. Markdown files
with simple front matter remain readable, portable, and diff‑friendly. So it is
reasonable to invest in a durable language that agents and humans can both work
with.

Then, why front matter?

A simple but important issue I found with markdown files is that these files
tend to have meaningful file names and directory structure. Though "meaningful"
is a nice nature, it is not easy to maintain meaningful and living files
avoiding breaks and refactoring. It will break any links to the file if the file
name changes, and it will be unaccessible if we refactor the structure and move
the file to a different location.

So, I tried to locate all my notes in a flat structure, and use front matter to
store the file name and directory structure. This way, I can maintain meaningful
and living files avoiding breaks and refactoring. This approach is more suitable
for version control by git.

In this situation, I cannot get any information about the file name and
directory structure from the file name.

```bash
% ls ./TODO | head -n 5
01998b0e-80f4-7982-bec6-a016754a03d9.md
01998df2-6064-771f-9b61-659ffbfd49f5.md
01998e00-424c-7996-b61b-2590d9e7cdd4.md
01998e6c-0114-7afe-ab5a-4b5f3270a0b0.md
01998e6e-5926-7843-a8d8-a4c76d2d8600.md
```

It is because `mdf` provides `list` command to list files with specified front
matter.

```
$ npx @stakme/mdf list --format "[{{status}}] {{title}}" ./TODO | head -n5

[todo] Add docs for `append` command
[done] Refactor App.tsx for the viewer
[done] Introduce code highlighting like GitHub
[done] List output should be accessible paths if `--quiet` is passed
[todo] Link for Markdown files is not readable
```
