---
name: difit
description: Ask the user for a code review by opening the changes in difit, a local diff viewer. Explicit opt-in only — use when the user names difit, asks to open or show the diff in the viewer, or has a standing instruction to request reviews through difit after changes. Do not use it for ordinary requests to review code, diffs, commits, branches, or pull requests.
---

# Difit

Use only for an explicit difit/viewer request, skill invocation, or standing
instruction to request difit reviews. Ordinary review requests belong in chat.

Use a source build of `@photostructure/difit` for `<difit-command>` until the
next release: published 5.1.0 lacks named captures and the launch JSONL protocol.
Check `--version` and `--help` for `--review` and `--jsonl`; use the same build for server and
comment commands. Never substitute unscoped npm `difit`. Run from the reviewed
Git root. Report missing capabilities rather than switching/installing.
For uncommitted work, use `<difit-command> --review <task-name> --keep-alive`.
Repeat `--pathspec <git-pathspec>` for native Git filters/exclusions and add
`--include-untracked` when needed. Names are 1–80 ASCII letters, digits, dots,
underscores, or hyphens, starting with a letter or digit. Check the captured patch
against the requested scope; a matching file may also contain another task's work.
Capture operations leave the Git index and working files unchanged.
For commits, launch `<difit-command> <target> [base]` using immutable SHAs when
approval matters. Existing unnamed `.`, `working`, and `staged` remain available.

To select part of an overlapping file, save an artifact and use its catalogue IDs:

```sh
<difit-command> review capture --pathspec src --output /tmp/capture.json
<difit-command> --review parser-fix --capture /tmp/capture.json --select '<hunk-id>' --keep-alive
```

Replace the placeholder with a printed ID; repeat `--select` for files/hunks.
IDs belong to that artifact's digest. File-only changes such as binary or rename
changes require a file ID. Artifacts are bound to the repository root.
`<difit-command> - --review <task-name> < /tmp/selected.patch` captures a supplied
patch. Pathspecs and `--include-untracked` apply only to native captures.

Native capture rejects affected external clean/process filters, including inside
checked-out submodules. Narrow `--pathspec` to unaffected paths, or explicitly
generate the wanted patch and provide it through stdin or a prepared `--capture`
artifact. Imported patches remain supported.

Retain the foreground process handle. Reuse its server for another task with
`review create <name> --port <api-port> [--pathspec ...]`. The task appears in the
already-open viewer's revision menu under **Recent reviews**, even without comments;
tell the user to switch there to keep the existing tab's editor connection. Read
`GET /api/reviews/<name>` before `review update <name> --port <api-port>
--expected-version <n>`; updates can also use `--capture` or stdin `-` and selectors.
HTTP 409 requires reconciliation with the current version before retrying.
Source edits and browser refresh never recapture a named review. A changed patch
advances its version and revokes LGTM while retaining the conversation/proposal;
an identical patch preserves version and approval after checking expectedVersion.
Names and capture history last for the server process.

Stdout is JSONL by default (`--jsonl` is explicit; `--no-jsonl` selects human output).
JSONL and named reviews require conversation APIs. An unnamed review can disable
them with `--no-jsonl --no-conversation`; `--no-jsonl` alone keeps the APIs.
Read `server.ready` for the actual API port, PID, and repository/review identity.
Companion commands use its `port`, never the Vite UI port. Give the reviewing user
`launchUrl`, which includes the editor-session fragment, rather than the tokenless
API `url`. Diagnostics go to stderr.
Conversation and LGTM are enabled by default. Use `--keep-alive` for review rounds
and `--no-lgtm` for read-only review. `--background` detaches without live stdout;
use it only with snapshot recovery, not for active event consumption.
A viewer request grants no edit/commit permission; make requested, authorized
fixes only in the owning checkout.

Use `<difit-command> schema [events|summary|reply|status|snapshot|comments|import|approval|capture|capture-update]` to discover
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
marking output handled. Capture metadata identifies the current patch; thread
capture metadata identifies the original anchor, which can be outdated after an update. `review.capture`,
progress, thread changes, and `comment.deleted` update
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
commit. For named reviews also match `approval.captureVersion` and
`approval.patchDigest` to the snapshot's `capture`, and `approval.summaryVersion`
to `summary.version`. Check the actual commit scope against the approved capture;
later shared-tree edits do not acquire approval. Revocation/restart invalidates
prior button approval. Then commit without asking again. Separate chat approval is independent; silence/tab closure is not
approval. This rule never authorizes a push or publication.

Details: [conversation protocol](https://github.com/photostructure/difit/blob/main/docs/agent-conversations.md).
