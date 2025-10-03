---
title: Modernize viewer UI with React bundle
vpath: backlog/refactor
status: done
author: "@assistant"
tags: [viewer, frontend]
created_at: 2025-09-30T12:30:00.000Z
updated_at: 2025-09-30T12:30:01.000Z
---

# Modernize viewer UI with React bundle

## Why

- The current viewer HTML is assembled in `src/commands/viewer.mts`, making
  layout changes fragile.
- Styling depends on CDN-hosted Tailwind/shadcn assets; offline use is brittle.
- We now have a modernization plan in
  [Viewer Modernization Plan](./01K6M1H2TSC9RPV039ZPV7QW4T.md) that outlines a
  React + Vite approach.

## What

- Follow the modernization plan to scaffold a `viewer-app/` React project with
  Vite + Tailwind.
- Expose JSON endpoints from the CLI to provide documents, navigation, and
  metadata to the new UI.
- Serve the built assets from the `viewer` command alongside the existing
  hot-reload SSE endpoint.
- Retire the string-based HTML renderer once feature parity is confirmed and
  tests cover the new endpoints.

## Definition of done

- React-based viewer is the default experience behind `mdf viewer`.
- Viewer works offline with locally bundled CSS/JS.
- Regression test suite covers navigation, front matter linking, and SSE-driven
  reloads.
