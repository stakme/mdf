---
title: Local configuration
vpath: /recipes
tags:
draft: false
chapter: 330
---

`mdf` merges local configuration files (`mdf.local.mts`) into the base config.
This is useful for user-specific settings like username.

Assume you have a global config with a default author:

```ts
export default defineConfig({
    defaults: {
        author: z.string(),
    },
});
```

In this case, you can create a local config that provides the author name:

```ts
export default defineConfig({
    defaults: {
        author: "John Doe",
    },
});
```

Now `mdf` will use "John Doe" as the author name when creating new files.

```bash
mdf new ./TODO
```
