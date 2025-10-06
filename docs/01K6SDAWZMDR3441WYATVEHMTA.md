---
title: Change logs
vpath: /
tags: []
draft: false
chapter: 4
---

# Change logs

An intentional changelog is the heartbeat of every release. Use it to explain
*why* a version matters, not just *what* files changed. The `CHANGELOG.md`
shipped with `mdf 1.0` follows the [Keep a Changelog](https://keepachangelog.com)
format so readers can scan for features, fixes, and breaking changes in seconds.

> ✍️ **Narrate the impact.** Focus each bullet on the outcome a user gains,
> then link to docs or guides that help them try the feature immediately.

## Why maintain a living log

- **Build trust.** Contributors and customers can see momentum and plan their
  upgrades confidently.
- **Simplify support.** When someone reports an issue, you can quickly pinpoint
  the version that introduced (or fixed) it.
- **Celebrate progress.** Releases become a chance to highlight wins across the
  team.

## Structure to follow

```markdown
## [VERSION] - YYYY-MM-DD
### Added
- Highlight new capabilities and how to access them.
### Changed
- Capture UX tweaks, renamed flags, or notable behavior adjustments.
### Deprecated
- Warn about features that will disappear soon and point to replacements.
### Removed
- Call out anything that is no longer available.
### Fixed
- Summarize bugs you resolved and the symptoms they addressed.
### Security
- Note vulnerabilities, CVE links, or hardening work.
```

Keep an `[Unreleased]` section at the top so you can jot notes throughout the
sprint, then move entries under the version header when you cut a release.

## 1.0.0 spotlight

- **Stable CLI toolkit.** Initialization, scaffolding, validation, updating,
  and automation flow together for production knowledge bases.
- **Viewer everywhere.** Ship polished docs via the live viewer or a static
  export without sacrificing navigation or filters.
- **Release guardrails.** SemVer rules, quality gates, and publishing checklists
  now live in `AGENTS.md` for every maintainer.

For future versions, mirror this storytelling style so the changelog reads like
a product narrative—not just a diff.
