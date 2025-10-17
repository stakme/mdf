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

Collect supporting files for a note, move them into an assets folder, and append Markdown image references—automatically.

```bash
npx @stakme/mdf append docs/100-overview.md diagram-sketch.png wireframe.jpg
```

What happens:

- The note name becomes the assets directory (for example, `docs/100-overview/`).
- Provided files are moved into that directory; existing files trigger a conflict instead of being overwritten.
- The note body gains `![alt](relative/path)` lines at the end, separated by a blank line. Alt text is derived from filenames (e.g., `diagram-sketch.png` → `diagram sketch`).

Use this to keep screenshots, diagrams, and attachments close to their parent note without hand‑editing links.

