---
title: Read native Git diff metadata from raw NUL-delimited records
section: Git integration
---

# Native Git diff metadata

For repository-backed comparisons, obtain file identity, status, modes and object IDs through `git diff --raw -z` rather than inferring them from patch headers. Keep the documented patch parser for hunks and imported stdin/PR patches, where the original repository may be unavailable. Preserve copy/rename detection choices and capture consistency when combining metadata with patch content. Resolve the named-review capture design before implementation: `src/server/review-capture.ts` creates repository-backed artifacts that currently retain patch text and render through `parseStdinDiff`; decide whether to persist raw metadata with corresponding schema/digest changes or retain the patch-parser path for those artifacts.

Raw records provide explicit fields and unquoted NUL-delimited paths, avoiding dependence on display quoting. Before adopting this path, verify identical results under `LANG` / `LC_ALL` variations (`C` and available UTF-8 locales), including spaces, tabs, newlines, Unicode, renames, copies, modes, binary changes and submodules. Define handling of filenames that are not valid UTF-8 rather than silently corrupting them.

Carry copy status through the shared types and UI instead of presenting copies as renames. The current model represents both as `renamed`; the native metadata migration should preserve their distinct meanings and test both labels.

Context: Matthew requested this follow-up while reviewing the metadata-only path fix (`4335456`, `fix(git-diff): preserve paths in metadata-only patches`). That correction and `src/server/git-diff.metadata.test.ts` remain independently useful for imported patches. This plan records a future migration.

Reference: [Git raw output format](https://git-scm.com/docs/git-diff#_raw_output_format).
