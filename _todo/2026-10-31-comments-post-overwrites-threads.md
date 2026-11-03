---
title: Preserve comment threads when baseVersion is missing or invalid
section: Comment API
---

# POST /api/comments without a valid baseVersion replaces every thread

Placeholder. Not started.

## Problem

`POST /api/comments` (`src/server/server.ts`) replaces the session's whole
thread list with the posted threads whenever `baseVersion` is absent or
invalid. `parseBaseVersion()` maps a negative, non-integer, or missing value to
`undefined`, and `isStale` is then false, so the handler skips
`mergeCommentThreads()` and stores only what the caller sent.

Seen on 2026-10-31: an agent posted one new review-scope thread to a running
review with a negative `baseVersion`. The post deleted the reviewer's existing
thread and its reply. The agent had to restore them by hand, and their
timestamps changed.

## To decide

- Reject a present-but-invalid `baseVersion` with 400 instead of treating it as
  absent.
- Whether an absent `baseVersion` (kept for older clients, per the comment on
  `parseBaseVersion()`) should still overwrite, or should merge.
- Whether agents should create review-scope threads through this endpoint.
  No CLI command currently creates those threads: `comment reply` needs an
  existing thread, and `comment add` requires a file location. Moving creation
  to the CLI would first require review-scope support in comment imports.

## Done when

A test posts one thread with a negative `baseVersion` to a session holding
another thread, and the earlier thread survives (or the request fails with 400).
