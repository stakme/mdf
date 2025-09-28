---
title: MDF Viewer Overview
description: Learn how to browse Markdown content with the built-in viewer.
vpath: docs/viewer/overview
date: 2025-09-28
tags:
  - docs
  - viewer
draft: false
---

# MDF Viewer Overview

The MDF viewer renders Markdown content with front matter as a browsable
website.

## Features

- Lists documents grouped by their virtual path (`vpath`).
- Provides instant search powered by a React island.
- Supports light and dark themes.

## Usage

Run the CLI command to start the development server:

```bash
mdf viewer
```

Open the printed local URL in your browser to explore the docs.

## Front Matter

Provide a `vpath` to control the generated URL. If omitted, the file name
determines the slug.
