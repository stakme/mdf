---
title: Update viewer UI
status: done
author: "@stakme"
tags: []
created_at: 2025-10-13T01:34:04.888Z
updated_at: 2025-10-13T03:39:13.241Z
---

# Update viewer UI

## What I need

Because I expect that users will manage markdown files in git, I want to update
viewer UI to be more git-friendly.

## So I will create...

### .config/mdf.mts

Add `repo` option to its root.

```ts
defineConfig({
    repo: {
        icon: "github", // github or gitlab
        url: "https://github.com/stakme/markdfm/tree/main/",
    },
});
```

### viewer-app

Remove these texts abount file path.

![image](01K7DK82HV2HABD42C9H8XKF08/image.png)

And add a button to open specific file in GitHub or GitLab.
