---
title: Flat Structure
vpath: /recipes
tags:
draft: false
chapter: 310
---

Though you can use `mdf` with any directory structure, I recommend to use a flat
structure with meaningless file names.

For this project,I created backlog tickets in a single `TODO` directory. At the
moment, I have 75 tickets there. Their names are generated with uuid v7, ulid or
timestamp: I tried several ways, but all of them are not readable.

```bash
$ ls ./TODO | wc -l

75
```

I choose to use a flat structure and such surrogate-key way because:

- To strictly avoid to give a file path any information. See
  [my post](/#/500-why-frontmatter) for more details.
- Structure itself is a part of our knowledge. It may change and evolve, and
  humans and AI should update it with zero friction. In this perspective, we
  must have structure-specific language in our files not in file paths.

I introduced `vpath` and use it to organize files.
