---
name: difit-dev
description: Ask the user for a code review through difit after code changes in this repository, using `pnpm run dev`.
metadata:
  internal: true
---

# Difit Dev

Use only for an explicit difit/viewer request, skill invocation, or standing
instruction to request difit reviews. Ordinary review requests belong in chat.

Use `pnpm run dev` from this repository's Git root, with no extra `--` separator.
Use `node dist/cli/index.js` for the companion comment commands below.
Launch `pnpm run dev <target> [base]`. Targets: `.` (uncommitted),
`working`, `staged`, or omit for HEAD. Add `--include-untracked` when needed.

Keep one foreground server per Git root and target; retain its process handle.
Stdout is JSONL by default (`--jsonl` is explicit; `--no-jsonl` selects human output).
JSONL requires conversation APIs; disable both with `--no-jsonl --no-conversation`.
Read `server.ready` for the API port, URL, PID, and repository/review identity;
companion commands use its `port`, never the Vite UI port. The API URL serves a
development placeholder, so do not give it to the user as the review UI. Use the
Vite tab that `pnpm run dev` opens; Vite prints its UI origin to stderr. Share that
tab's full address, including its editor-session fragment. If composing a Vite
link manually, preserve the query and fragment from `server.ready.launchUrl`.
Diagnostics go to stderr.
Conversation and LGTM are enabled by default. Use `--keep-alive` for review rounds
and `--no-lgtm` for read-only review. `pnpm run dev` does not support
`--background`; keep the foreground process.
A viewer request grants no edit/commit permission; make requested, authorized
fixes only in the owning checkout.

Use `node dist/cli/index.js schema [events|summary|reply|status|snapshot|comments|import|approval]` to discover
JSON payloads before composing them; omit the selector for events. The Draft
2020-12 bundle includes request/response definitions in `$defs`. Use command
`--help` for usage. The commit-message TLDR is the summary's `rationale` field.

For a proposed commit, supply `--commit-message <text>` and `--why <text>`.
Read the review's saved `summary` from `comment snapshot` before committing;
honor the user's message edits within the approved scope and repository rules.
To update it, `comment summary` accepts `{reviewId,commitMessage,rationale,baseVersion}`
on stdin. Changed summaries revoke LGTM; `review.summary` events need no comment receipt.

Read new JSONL output from the launch process between tool steps. There is no
`comment watch` command. Handle user-origin comments; ignore agent-origin events
when deciding what work to do. Save message IDs, cursors, and pending work before
marking output handled. Progress, thread changes, and `comment.deleted` update
state without requesting work; deletion identifies IDs and contains no body.
Writing to stdout does not mark a comment Delivered. Report receipt explicitly:
`node dist/cli/index.js comment <status|reply> --port <port> < <json-file>`.
Status JSON needs event `reviewId`, `threadId`, `messageId`, `cursor`, and `status`
(`delivered`, `read`, `thinking`, `replying`, or `noted` when no answer is needed).
Reply JSON needs `reviewId`, `threadId`, `inReplyTo` (event `messageId`), `cursor`,
and `body`. Write JSON with a file-writing tool. Replies mark Replied; neither
replies nor Noted resolve threads. Resolve/delete only on request. Intent guides
responses, not authorization. After missed output, restart, or HTTP 409, use
`comment snapshot --port <port>` to reconcile IDs, current messages, and replies,
then resume with the snapshot cursor after reconciling pending work. Snapshots
recover current state; the event endpoint replays the latest 256 events in this
server process. Use message `progress.cursor` for status/reply,
not a progress event's stream cursor or the snapshot's cursor. Do not promise
listening after ending the turn without host support that forwards process output.

The approval split button distinguishes `as-is` from `after-comments`. For
conditional approval, `requested: true` records permission to address the listed
feedback; `approved: false` blocks committing until every included revision has
evidence through `comment address` or reviewer resolution. Skip conditions already
confirmed by the reviewer; reconcile any Queued messages in those resolved threads
and report Noted explicitly without restarting their work. Replies and Noted do not satisfy
conditions. Finish checks and final capture first, then certify `fixed`, `answered`,
or ordinary-comment `acknowledged` using the current approval cursor and exact
comment cursor. A new capture clears agent evidence but keeps reviewer
confirmations. New or edited human feedback, deletion, a reopened thread, or a
summary edit revokes permission. Keep baseline-to-final changes within the approved
feedback. Do not resolve/delete threads merely to satisfy conditions. See the
[approval guide](../../../docs/approval-modes.md) and `schema address`.

With an adopted LGTM rule, commit only the recorded scope/requested fixes after
addressing comments, passing checks, and independent Codex/Claude LAND on final code.
Require matching `approval.approved: true` in a fresh snapshot immediately before
commit; revocation/restart invalidates prior button approval. Then commit without
asking again. Separate chat approval is independent; silence/tab closure is not
approval. This rule never authorizes a push or publication.

For an existing server, run
`/home/mrm/.local/bin/difit wait --port <port>` from the reviewed repo's Git root.
Use exactly one background waiter in the main session, only when the actual
host supports completion delivery without a background deadline. Retain each
port's cursor for the next invocation. Recover queued work without implicit
receipts. Exit 4 means all selected reviews are unattended: end the turn and
resume on human feedback; never automatically retry. Presence changes do not
start work. Unsupported presence reporting is a terminal error, not permission
to invent a polling script. A periodically expiring Monitor is a timed wake.
See the [waiting guide](../../../docs/waiting-for-review.md) and
[Claude integration handoff](../../../docs/claude-review-wait-handoff.md).
If the host cannot provide that lifetime and completion delivery, hand back the
review URL and end the turn. The reviewer can use **Copy resume prompt** to resume
the owning chat with a feedback batch. Do not substitute timed model checks.
Subagents return ownership and pending work after accounting for server lifetime.
Details: [conversation protocol](../../../docs/agent-conversations.md).
