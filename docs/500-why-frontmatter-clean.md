---
title: Why Front Matter
vpath: /notes
tags:
  - blog
  - read this first
draft: false
chapter: 500
---

Tools come and go, plain text endures.

In a fast‑moving AI era, Markdown with a small, predictable front matter block
stays readable, portable, and easy to diff. It’s worth investing in a format
that both humans and agents can edit confidently.

But we have directories and files with meaningful names. Why front matter?

Filenames and folder structures often carry meaning. That’s useful until you
need to rename or reorganize: links break, paths go stale, and refactors become
risky. Keeping files “meaningful and living” is hard when their meaning is baked
into the path.

A practical alternative is to store notes in a flat directory and put the
logical path (and other metadata) in front matter. This decouples the physical
location from the logical address, so you can refactor freely without breaking
references. It also plays nicely with Git.

In this setup, on‑disk filenames don’t need to be human‑readable:

```bash
% ls ./TODO | head -n 5
01998b0e-80f4-7982-bec6-a016754a03d9.md
01998df2-6064-771f-9b61-659ffbfd49f5.md
01998e00-424c-7996-b61b-2590d9e7cdd4.md
01998e6c-0114-7afe-ab5a-4b5f3270a0b0.md
01998e6e-5926-7843-a8d8-a4c76d2d8600.md
```

Instead, `mdf` reads front matter and lists files using the fields you care
about:

```
$ npx @stakme/mdf list --format "[{{status}}] {{title}}" ./TODO | head -n5

[todo] Add docs for `append` command
[done] Refactor App.tsx for the viewer
[done] Introduce code highlighting like GitHub
[done] List output should be accessible paths if `--quiet` is passed
[todo] Link for Markdown files is not readable
```

Front matter lets you preserve meaning without coupling it to the filesystem.
You keep stable, refactor‑friendly files and gain reliable automation that can
understand and present your content.
