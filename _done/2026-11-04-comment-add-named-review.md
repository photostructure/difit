---
title: Let `difit comment add` target a named review
section: Comment API
---

# `comment add` cannot choose a named review

Done: `comment add --review <name>` posts to `/api/comment-imports?review=<name>`.

## Problem

`difit comment add --port <port>` (`src/cli/comment.ts`) posts to
`/api/comment-imports` with no `review` query parameter, so the server's
`getCommentSelectionFromQuery()` (`src/server/server.ts`) files the comments
under `currentCommentSelection`: the launch review until the viewer loads
another, then whichever review `GET /api/diff` last loaded. An agent cannot
choose which named review on the same server receives its comments.

Seen on 2026-11-04: an agent following `skills/difit/SKILL.md`, which says to
preload comments on a reused server with `comment add --port <api-port>`, had
to POST to `/api/comment-imports?review=<name>` directly for its second review.

## Fix

Add `--review <name>` to `comment add` and pass it as the `review` query
parameter, with a test that a comment added to a second named review appears in
that review and not in the launch review. Update the skill sentence to name the
option.
