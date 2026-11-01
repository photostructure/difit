# Review conversations

Start a foreground review with `difit <target> <base> --keep-alive` and retain its
process handle. Conversation and LGTM are enabled by default. Prefer immutable
target/base commits for approval. For mutable targets, save the reviewed patch,
base SHA, and included untracked contents, then track requested fixes so unrelated
edits cannot enter the approved scope. `--keep-alive` lets questions continue
across browser disconnects; LGTM keeps the review open when approval changes.

## Discover payloads

Run `difit --help` for commands and `difit comment <command> --help` for companion
command usage. `difit schema` prints a JSON Schema Draft 2020-12 bundle for launch
events. Select a root with `difit schema events`, `summary`, `reply`, `status`, or
`snapshot`; `comments`, `import`, and `approval` describe the other control payloads.
The bundle's `$defs` also describe request/response payloads, comment
messages and edits, progress, threads, and approval. Read the installed build's
schema rather than copying payload definitions from another version.

The proposed commit message is `commitMessage`; its TLDR is `rationale` in
`comment summary` JSON. Both are editable in the browser, and saved changes emit
`review.summary`. Comments, replies, and progress reports are JSON as described
below. Schema discovery does not start a review server.

## Launch output and event consumption

Foreground stdout emits one JSON object per line by default. `--jsonl` selects
this explicitly; `--no-jsonl` selects human-readable output. Startup diagnostics
go to stderr in both modes; human-mode comment and approval output goes to stdout.
There is no separate `comment watch` command or conversation long-poll
endpoint. Read output from the running launch process between tool steps.
`--background` detaches the server and returns connection information without
live stdout; use foreground `--keep-alive` for active agent conversations. JSONL
requires conversation APIs. To disable conversations, pass both `--no-jsonl` and
`--no-conversation`; `--no-jsonl` alone retains the control APIs.

The first `server.ready` event includes `port`, `url`, `launchUrl`, `pid`, `reviewContext`,
`selection`, `reviewId`, and `timestamp`. Use its actual API port for
companion commands: 4966 may be occupied, and the Vite UI port is not the API port.
`url` is the API origin without an editor token. For production launches, give
the reviewing user `launchUrl`: its fragment carries the editor-session token
needed for open-in-editor actions. In development, the review UI is the Vite tab
opened by `pnpm run dev`; preserve the query and fragment from `launchUrl` when
constructing a link on the Vite origin.
`server.shutdown` includes `reason`, `pid`, and `timestamp`.

Each submitted comment or reply emits an event as soon as the browser saves it,
without waiting for approval or closing the tab. Partial text still being typed
is not sent. Message events include `type` (`comment.created` or `comment.updated`),
`origin` (`user` or `agent`), `cursor`, `reviewId`, `selection`, `threadId`,
`messageId`, `file`, `side`, `line` (a number or `{start,end}`), `body`, `author`,
`timestamp`, and the available `codeSnapshot`. Working-tree and stdin selections
remain mutable; the code snapshot records the excerpt the commenter saw, not a
full immutable repository snapshot.

The stream also carries `review.approval`, `review.summary`, `comment.progress`,
`comment.deleted`, `thread.resolved`, `thread.reopened`, and `thread.deleted`.
Progress events include review, thread, and message IDs, `selection`, agent `origin`, stream
`cursor`, `progress`, and `timestamp`. Their `progress.cursor` identifies the
comment revision; their outer `cursor` identifies the progress event. Thread
events include review/thread IDs, `selection`, `origin`, `cursor`, and `timestamp`.
`comment.deleted` additionally identifies `messageId` and contains no body.
These state changes are not new work requests.

Persist handled message IDs, cursors, and pending work before marking launch
output handled. Writing an event to stdout does not prove the agent received it;
send an explicit Delivered receipt with `comment status` after consumption.
After output loss or server restart, run `comment snapshot --port <port>` to
obtain `{reviews,cursor}`. Each review includes its `id` (use as `reviewId`),
selection, threads, and message IDs. A snapshot recovers current state, including
message deletions and edits, rather than missed events. Reconcile outstanding work
and existing replies, then continue consuming new launch output. There is no
cursor-based resumption or event replay. The snapshot and its state checkpoint
cursor are captured together. Compare that cursor for equality with concurrently
buffered live event cursors: a matching event's state change is already reflected
in the snapshot. Treat the tokens as opaque; do not decode or sort them, or use
them to request replay. Consumers reconciling the full state may ignore the
checkpoint cursor. Use message `progress.cursor` for status/reply
revision guards, not the snapshot's checkpoint cursor. An existing detached server can be recovered
through snapshots, but it has no launch stream available to the agent.

Browser storage may restore old threads into a restarted server. These arrive
as created events, preserving agent origin. Compare message IDs and bodies with
persisted handled work and existing replies before answering restored questions.

Reply by IDs from the event, using JSON on stdin to avoid shell quoting errors:

```sh
difit comment reply --port 4966 < /tmp/difit-reply.json
```

```json
{
  "reviewId": "<event.reviewId>",
  "threadId": "<event.threadId>",
  "inReplyTo": "<event.messageId>",
  "body": "The answer, or what changed and how it was verified.",
  "cursor": "<event.cursor>",
  "author": "Codex"
}
```

Use a file-writing tool to create the JSON. The reply API checks the exact review,
thread, and parent message, even after another browser tab changes revisions.
Identical retries are idempotent. Deleted threads/parents return 404; reconcile
instead of creating a new conversation at the same line. Replies render live
through the existing browser event connection. Ignore `origin: "agent"` events
when deciding whether to answer, to avoid replying to your own replies.

Read questions and change requests as they arrive. Answer questions in-thread;
start requested changes while the user continues reviewing. Ordinary review text
does not authorize commits. A read-only review of someone else’s PR or a stdin
diff does not grant write permission; perform requested fixes only in the
checkout that owns those changes. Leave answered threads visible. Resolution
preserves history and can be reopened; deletion is a separate explicit action.
This CLI transports messages; it does not invoke a
model or automatically resume an idle agent. The active agent must read new launch output
between tool steps, or its host must forward events to its session. Do not claim
to keep listening after ending a turn without such a host integration.

## Proposed commit message and rationale

The review's proposed commit message and short rationale explain what would be
committed and why. Seed the initial selection when starting difit:

```sh
difit . --commit-message 'fix: preserve review intent' --why 'Keep the proposed change clear during review.'
```

The browser can edit and save these fields for each diff selection, including
with `--no-jsonl --no-conversation`. Values are process-local and disappear when
the server restarts. Saving a changed proposal revokes any existing LGTM approval for that
selection. Editing these fields never executes Git or creates a commit.

`comment snapshot --port <port>` includes `summary` on each review:
`{commitMessage,rationale,version,updatedAt?}`. Use that review's `id` and summary
version to write a proposal without following another tab's current selection:

```sh
difit comment summary --port 4966 < /tmp/difit-summary.json
```

```json
{
  "reviewId": "<snapshot.reviews[n].id>",
  "commitMessage": "fix: preserve review intent",
  "rationale": "Explain the reason for this change.",
  "baseVersion": 0
}
```

The command prints the saved summary. A stale `baseVersion` fails; read the
latest snapshot and reconcile the proposal before retrying. Empty strings clear
the fields. Commit messages are limited to 16000 characters and rationales to 4000. Unchanged saves preserve the version and emit no event.

Saved changes emit `review.summary` events with `origin`, `reviewId`, `selection`,
`summary`, `cursor`, and `timestamp`. These events have no thread or message ID
and require no comment receipt. Browser writes always use user origin; the agent
command always uses agent origin. Approval revocations emit `review.approval`
with the summary edit's origin; direct approval changes use user origin.

Browser API: `GET /api/review-summary?base=...&target=...&baseMode=merge-base`
returns the summary (initially empty, version 0). `POST` to the same URL accepts
`{commitMessage,rationale,baseVersion}`. Agent writes use
`POST /api/conversation/summary` with the command's JSON shape. Both require
`application/json` and return the saved summary. Stale writes return HTTP 409
with `{error,summary}` containing the latest version. Browser updates broadcast
`reviewSummaryChanged` through the existing watch connection.

Approving with `POST /api/approval` includes the displayed `summaryVersion`.
The server rejects an approval for an older proposal with HTTP 409. Revocation
remains available regardless of the summary version.

## General conversation and comment intent

The header's **Conversation** button opens a panel containing general and inline
threads. The general composer accepts comments or questions about the whole review.
**Send** posts immediately. New comments, replies, and message edits share one
Intent radio group: **Comment** (default) shares context without requesting a
reply, **Change request** asks for a code change and follow-up, and **Question**
asks for an explanation. The body and existing authorization determine what the
agent should do; intent is not approval to commit, push, or publish. Explicit
root-message intent takes precedence over the older thread-level question flag,
which remains a fallback for saved threads without explicit intent.

General threads and events have `scope: "review"` and omit file/line location.
Use the event's review/thread/message IDs for status and replies just as for inline
comments. Message events carry optional `intent`: `comment`, `question`, or `change`.
An intent change is a new message revision, like a body edit.

**Resolve thread** retains all messages and collapses the conversation. **Reopen**
restores it. The Conversation panel can show All, Open, or Resolved conversations.
Resolution is separate from reply status: an answer does not prove that a requested
change is resolved. Agents should resolve only when the user requests it.

```sh
difit comment resolve <threadId> --review <reviewId> --port <port>
difit comment reopen <threadId> --review <reviewId> --port <port>
```

Use `--review` from the event to avoid another tab's selected review. Without it,
these commands act on the server's current selection. The HTTP route is
`POST /api/comments/:threadId/resolution` with `{reviewId, resolved}`.
Resolution persists with comment history. It emits `thread.resolved` or
`thread.reopened` and refreshes the browser; deletion emits `thread.deleted`.
These events do not require comment receipts or replies.
`comment delete <threadId...> --port <port>` (alias `remove`) still deletes from
the current selection. Unlike older versions, `comment resolve` no longer deletes.
Delete only when the user explicitly requests removal.

## Comment progress

Each user message starts Queued → Delivered → Read. Work continues through
Thinking → Replying → Replied. Use Noted when a comment needs no response.
These are receipts and explicit agent reports, not inferred model activity.
Stdout output does not count as delivery. Report `delivered` explicitly after
consuming a user message. Read, Thinking, and Replying also require agent reports:

```sh
difit comment status --port <port> < /tmp/difit-status.json
```

```json
{
  "reviewId": "<event.reviewId>",
  "threadId": "<event.threadId>",
  "messageId": "<event.messageId>",
  "cursor": "<event.cursor>",
  "status": "thinking"
}
```

Send `delivered` after receiving the comment, `read` when you inspect it, `thinking` while investigating or
implementing its request, and `replying` while composing the answer. States can
be skipped; delayed requests cannot move progress backwards. Include the same
message-event cursor in the reply JSON to finish with Replied. Older replies
without a cursor still work but do not assert that the current wording was
answered. Editing a comment resets its progress; stale status/reply cursors
return 409. Reconcile the latest event or snapshot before proceeding. From a
snapshot, use the message's `progress.cursor`, not the snapshot's checkpoint cursor.
Deleted comments return 404. Status updates emit `comment.progress`, not new
message events. Use `progress.cursor` from a progress event for revision guards.
Reply to questions, requested changes, and anything needing clarification. Simple
acknowledgments and LGTM should be marked `noted` after considering them, without
a redundant answer. Noted records that no reply is needed; Read only records
inspection. Neither status resolves the conversation.

Progress is process-local and resets on server restart, even when the browser
restores comments. Hover over a status for its last update time; an inactive
agent's last report is not proof it is still working. The HTTP status endpoint
is `POST /api/conversation/status` and accepts the same JSON as the CLI.

## LGTM and commit approval

When the user or project adopts this rule, clicking the LGTM image grants
conditional approval to commit the reviewed scope, including requested fixes.
The image stays visible: gray means unapproved, green means approved. A second
click revokes approval and returns it to gray. Hover does not change its color.
The server stays running. Approval is scoped to the displayed selection and is
restored after browser refresh; a server restart resets it to unapproved.

The launch stream emits a `review.approval` event with `reviewId`, `selection`,
`approved`, `origin`, `cursor`, and `timestamp`. It has no thread or message ID, and does
not need a comment receipt or reply. `comment snapshot` includes `approval`
on each review. After addressing comments and completing the checks below,
fetch a fresh snapshot immediately before committing and verify that the matching
review still has `approval.approved: true`. An older approval event does not
override a later revocation. Missing state or an unavailable server is not proof
of approval. Separate explicit chat approval is independent of the button state
unless the user revokes it. Revoking cannot undo a commit already made.

Match immutable targets to the saved SHA and mutable targets to the recorded
patch scope. A closed tab, quiet stream, timeout, resolved thread, answer, or
ordinary process exit is not approval.

The toggle uses `GET /api/approval?base=<base>&target=<target>` and
`POST /api/approval` with the same query and JSON `{ "approved": true }` or
`{ "approved": false }`; include `baseMode=merge-base` where applicable. Both
require `--ship-it`. GET is read-only and returns the current approval; it also
works without conversation mode. The legacy `POST /api/ship-it` approve-and-exit
endpoint remains available to old clients, but the toggle never calls it. An old
server without `/api/approval` must be rebuilt before using the toggle.

After LGTM, address every comment (answer questions or implement requested
changes), run the relevant checks, and obtain LAND from both Codex and Claude
second-opinion reviewers on the resulting code (for example via
`coding:second-opinion`; LAND means no remaining blocking findings). Then commit without asking for
approval again. Missing reviewers, outstanding comments, REVISE, or DISCARD keep
the commit blocked. Repeat review after code changes so LAND covers the final
tree. Approval does not cover unrelated additions and never authorizes a push,
publication, or invoking a landing workflow the user has not requested.

## Compatibility

Published `@photostructure/difit` 5.1.0 does not contain this launch JSONL
protocol. Until the next release, use a source build and verify that `--help`
includes `--jsonl` and `--no-jsonl` and `difit schema` succeeds. Within this repository use
`pnpm run dev <target> <base> --keep-alive`; use `node dist/cli/index.js comment …`
for companion commands after compilation. From another repository, an absolute
path to that built CLI preserves the reviewed repository as the working directory.
Keep the server and companion commands on the same build.

The HTTP equivalents are `GET /api/conversation/snapshot` (returns
`{reviews,cursor}`) and `POST /api/conversation/reply` (JSON body as above).
There is no `GET /api/conversation/events` endpoint. Conversation APIs require
`--conversation`, which is enabled by default. Responses include 400 for invalid
input, 409 for stale message cursors or summary versions, 404 for unknown
review/thread/parent or a disabled endpoint, and 415 for non-JSON replies.
Stream cursors and review IDs last only for the server process.
