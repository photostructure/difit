---
name: difit
description: Ask the user for a code review by opening the changes in difit, a local diff viewer. Explicit opt-in only — use when the user names difit, asks to open or show the diff in the viewer, or has a standing instruction to request reviews through difit after changes. Do not use it for ordinary requests to review code, diffs, commits, branches, or pull requests.
---

# Difit

Use only for an explicit difit/viewer request, skill invocation, or standing
instruction to request difit reviews. Ordinary review requests belong in chat.

Use a source build of `@photostructure/difit` for `<difit-command>` until the
next release: published 5.1.0 does not include the launch JSONL protocol below.
Check `--version` and `--help` for `--jsonl`; use the same build for server and
comment commands. Never substitute unscoped npm `difit`. Run from the reviewed
Git root. Report missing capabilities rather than switching/installing.
Launch `<difit-command> <target> [base]`. Targets: `.` (uncommitted),
`working`, `staged`, or omit for HEAD. Add `--include-untracked` when needed.

Keep one foreground server per Git root and target; retain its process handle.
Stdout is JSONL by default (`--jsonl` is explicit; `--no-jsonl` selects human output).
JSONL requires conversation APIs; disable both with `--no-jsonl --no-conversation`.
Read `server.ready` for the actual API port, PID, and repository/review identity.
Companion commands use its `port`, never the Vite UI port. Give the reviewing user
`launchUrl`, which includes the editor-session fragment, rather than the tokenless
API `url`. Diagnostics go to stderr.
Conversation and LGTM are enabled by default. Use `--keep-alive` for review rounds
and `--no-lgtm` for read-only review. `--background` detaches without live stdout;
use it only with snapshot recovery, not for active event consumption.
A viewer request grants no edit/commit permission; make requested, authorized
fixes only in the owning checkout.

Use `<difit-command> schema [events|summary|reply|status|snapshot|comments|import|approval]` to discover
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
`<difit-command> comment <status|reply> --port <port> < <json-file>`.
Status JSON needs event `reviewId`, `threadId`, `messageId`, `cursor`, and `status`
(`delivered`, `read`, `thinking`, `replying`, or `noted` when no answer is needed).
Reply JSON needs `reviewId`, `threadId`, `inReplyTo` (event `messageId`), `cursor`,
and `body`. Write JSON with a file-writing tool. Replies mark Replied; neither
replies nor Noted resolve threads. Resolve/delete only on request. Intent guides
responses, not authorization. After missed output, restart, or HTTP 409, use
`comment snapshot --port <port>` to reconcile IDs, current messages, and replies,
then continue reading new launch output. Snapshots recover current state; there
is no cursor-based resumption or event replay. Use message `progress.cursor` for status/reply,
not a progress event's stream cursor or the snapshot's cursor. Do not promise
listening after ending the turn without host support that forwards process output.

With an adopted LGTM rule, commit only the recorded scope/requested fixes after
addressing comments, passing checks, and independent Codex/Claude LAND on final code.
Require matching `approval.approved: true` in a fresh snapshot immediately before
commit; revocation/restart invalidates prior button approval. Then commit without
asking again. Separate chat approval is independent; silence/tab closure is not
approval. This rule never authorizes a push or publication.

Details: [conversation protocol](https://github.com/photostructure/difit/blob/main/docs/agent-conversations.md).
