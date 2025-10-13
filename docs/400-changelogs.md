---
title: Change logs
vpath: /
tags: []
draft: false
chapter: 400
---

# Change logs

An intentional changelog is the heartbeat of every release. Use it to explain why a version matters—not just what files changed. The `CHANGELOG.md` for `mdf 0.x` follows the [Keep a Changelog](https://keepachangelog.com) format so readers can scan features, fixes, and breaking changes quickly.

Tip: Narrate the impact. Focus each bullet on the outcome a user gets, then link to docs or guides that help them try it immediately.

## Why keep a living log

- Build trust: contributors and customers can see momentum and plan upgrades.
- Simplify support: quickly pinpoint when an issue was introduced—or fixed.
- Celebrate progress: releases become a chance to highlight wins.

## Structure to follow

```markdown
## [VERSION] - YYYY-MM-DD

### Added
- New capabilities and how to access them.

### Changed
- UX tweaks, renamed flags, or notable behavior adjustments.

### Deprecated
- Features that will disappear soon and their replacements.

### Removed
- Anything eliminated this release.

### Fixed
- Bugs and regressions addressed.

### Security
- Vulnerabilities, CVE links, or hardening work.
```

Keep an `[Unreleased]` section at the top so you can jot notes during the sprint. Move entries under the version header when you cut a release.

## 0.10.0 spotlight

- Stable CLI toolkit: initialization, scaffolding, validation, updating, and automation now flow together for production knowledge bases.
- Viewer everywhere: ship polished docs via the live viewer or static export without sacrificing navigation or filters.
- Release guardrails: SemVer rules, quality gates, and publishing checklists live in `AGENTS.md` for every maintainer.

For future versions, mirror this storytelling style so the changelog reads like a product narrative—not a diff.

