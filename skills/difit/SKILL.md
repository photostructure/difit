---
name: difit
description: Open a diff in difit, the local diff viewer, with reading-guide comments and a proposed commit message — either your own changes for the user to review, or a branch, commit, or GitHub PR the user names, which you first review for defects. Explicit opt-in only — use when the user names difit or $difit, asks to open, show, or annotate a diff in the viewer, or has a standing instruction to request reviews through difit after changes. Do not use it for ordinary requests to review code, diffs, commits, branches, or pull requests; answer those in chat.
---

# Difit

Use only for an explicit difit/viewer request, skill invocation, or standing
instruction to request difit reviews. Ordinary review requests belong in chat.

Decide what to show from the request:

- "Show me your difit", or no target: the changes this session made. For
  uncommitted work, a named review scoped to your own paths and hunks; for work
  you already committed, those commits.
- A named branch, commit, range, or PR (`--pr <url>`): that diff. Review it for
  defects before launching, and pass `--no-lgtm` unless the user asked to
  approve it. Do not post PR findings to GitHub.

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
The viewer's **About** panel names the agent, session, and session ID that
launched the review. difit fills in the agent and ID itself from
`$CLAUDE_CODE_ENTRYPOINT` and `$CLAUDE_CODE_SESSION_ID` (Codex:
`$CODEX_THREAD_ID` and its thread rollout); override them with `--agent <host>`
and `--agent-session-id <id>` when those are wrong or absent. A Claude Code
session started from another session's shell (such as `claude -p`) inherits
that session's entrypoint, so pass `--agent` there. Pass
`--agent-session-name <title>` when you know this session's title, since no
host exports it; never invent a title. They are set per server at launch;
`review create` on a reused server keeps the launching session's values.

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

Every review you open carries reading-guide comments and a change summary,
including read-only reviews. Preload comments that help the user navigate the
diff with repeatable `--comment` arguments (on a reused server, `comment add
--port <api-port>`; see `schema import`). Use `old` for deleted lines, `new`
for target lines, and a number or `{"start":36,"end":39}` for a range:

```sh
<difit-command> <target> [base] --keep-alive \
  --comment '{"type":"thread","filePath":"src/example.ts","position":{"side":"new","line":36},"body":"Start here: ..."}'
```

- On the first hunk worth reading, say where to start and the order in which
  the files make sense, unless the diff is a single hunk.
- On each line that is non-intuitive, odd, or confusing, explain it: a change
  whose reason is not visible in the hunk, code that looks wrong but is
  intended, a deletion whose replacement lives in another file, a test that
  exercises its subject indirectly, or mechanical churn that can be skimmed.
- On code in or next to the diff that deserves reworking or refactoring, say
  what you would change and why. These are suggestions, not changes you made.
- When you reviewed the diff for defects, state each finding on its line,
  opening with "Finding:" so it reads apart from the navigation notes.

One point per comment, anchored on the line it explains. Skip lines that
explain themselves. Keep credentials out of comment bodies and arguments, and
write in the user's language.

Always supply `--commit-message <text>`, the Conventional Commit message the
change would land under, and `--why <text>`, one to three sentences on the
problem and why this change solves it. When the diff is someone else's, write
them from your reading of it and say in the why where you inferred intent. On a
reused server, set them with `comment summary` after `review create`. Read the
review's saved `summary` from `comment snapshot` before committing; honor the
user's message edits within the approved scope and repository rules.
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
