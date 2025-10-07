---
title: "Introduce `slug` parameter"
status: done
author: "@stakme"
tags: []
created_at: 2025-10-06T10:53:02.223Z
updated_at: 2025-10-07T14:12:14.620Z
---

# Introduce `slug` parameter

## What I need

Currently, relative file paths acts as an unique ID for a specific file. But in
some cases, I want to define and keep immutable values to specify same contents.

## So I will create...

### .config/mdf.mts

- Add `virtualSlug` parameter to override the name of parameter we use to handle
  `slug` value, as the parameter `virtualPath` does that we already introduced.
- Default value for this parameter is undefined. System ignores `slug` logic
  when this parameter is undefined.
- User cannot use an empty string as a value for this parameter.

### viewer/export command

- Use `slug` to assign unique paths for pages when `virtualSlug` is defined in
  config file.
- If not, keep current logic to assign unique paths for pages: use relative
  paths from a root directory as unique IDs for a specific file.
