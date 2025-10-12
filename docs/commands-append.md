---
title: append
vpath: commands
tags:
  - cli
  - reference
draft: false
chapter: 209
---

# append <note> <files...>

Collect supporting files for a note, move them into an assets directory, and
append Markdown image references in one step.

```bash
npx @stakme/mdf append docs/100-overview.md diagram-sketch.png wireframe.jpg
```

When the command runs:

- The note name becomes the assets directory. For example, `docs/100-overview.md`
  stores files under `docs/100-overview/`.
- Each provided file is moved into that directory. Existing files trigger a
  conflict instead of being overwritten.
- The note body gains `![alt](relative/path)` lines at the end, separated by a
  blank line. Alt text is derived from the filename (e.g., `diagram-sketch.png`
  becomes `diagram sketch`).

Use this command to keep related screenshots, diagrams, or attachments with
their parent note without hand-editing Markdown links.
