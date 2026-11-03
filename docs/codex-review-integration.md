# Codex reviews without idle model turns

Reviewer presence and event subscriptions work independently of the agent host.
The host determines how a real human event reaches its model. Do not put a Codex
model in a loop that checks difit, shell-job status or browser state.

## Codex desktop: end the turn, resume on feedback

This workflow needs no external controller and starts no model turns while the
human is away:

1. From the reviewed repository's Git root, launch the source build using
   the difit launcher prescribed by the checkout's instructions with `--background`.
   Save its API port, review ID,
   browser URL, capture/summary versions, and pending message revisions. Use a
   named review when the patch must remain frozen.
2. Send any explicit receipts only after recording the corresponding work. Hand
   the URL to Matthew and end the Codex turn. Leave the detached server running.
3. After leaving feedback in difit, Matthew clicks **Copy resume prompt** and
   pastes it into the owning Codex chat. The button also works when the browser
   cannot determine listener presence. It copies a snapshot command and the
   review URL, with the editor-session fragment removed.
4. Codex reads one `comment snapshot --port <actual-port>`, reconciles queued
   messages and its saved pending work, and handles the feedback within the
   existing authorization. Preserve exact message revision cursors for receipts
   and replies. Check approval against the current capture and summary.
5. When caught up, Codex ends the turn again. It does not start a new waiter just
   to keep the chat busy. Delivered or Read messages still need reconciliation
   against saved work; only Queued messages are automatically recovered by wait.

The cost is one human paste per feedback batch. Closing the browser, leaving a
hidden tab, or leaving the server running does not itself start a Codex turn.
The listener indicator describes a subscription, not whether the model is active.
A host with an explicitly tested completion-to-turn path may instead use one
background waiter; do not infer that capability from process launch.

## Automatic integration: a controller owns event delivery

OpenAI's [app-server protocol](https://developers.openai.com/codex/app-server)
documents `initialize`, `thread/resume`, and `turn/start`. A controller that owns
the real app-server connection can keep the model idle and call `turn/start`
when difit returns a nonempty human-event batch. This is an integration contract,
not a claim that the difit CLI currently controls an arbitrary desktop chat.

An implementation must:

- Bind an explicit repository, server identity, review and Codex thread. Keep
  process-local review/cursor identities distinct from thread identity.
- Wait in ordinary code, without scheduled model prompts or timed model checks.
  Presence changes, HTTP empty rounds and agent receipts never start a turn.
- Store pending batches and per-port checkpoints before handing off work.
  Deduplicate recovered messages by server/review/thread/message/revision; the
  snapshot deliberately repeats still-Queued messages. Otherwise an unacknowledged
  comment could create an expensive self-sustaining loop.
- Serialize turns per thread and collect feedback arriving while it is busy.
  Treat delivery failures as terminal for automatic invocation; preserve the
  pending batch for explicit recovery instead of retrying model starts blindly.
- On exit 4, stop automatic turn starts. The controller may observe presence in
  ordinary code, but checking for a browser must never require a model turn.
- Keep host approvals and capture guards in effect. Do not infer permission to
  edit, commit or approve from presence or message intent.

The [CLI reference](https://learn.chatgpt.com/docs/developer-commands#codex-queue)
also describes `codex queue`, including version-dependent resume support. On this
host, `codex-cli 0.164.0` exposes `queue` but its help has no `--resume` option
(verified 2026-11-03). That is not evidence that queueing will wake this desktop
chat. Verify the installed command, owning server and actual delivery behavior
before using it as an automatic bridge. Do not start `codex exec resume` against
an already-managed desktop chat as a substitute for a verified connection.

## Claude integration

Claude can use one main-session background `difit wait` when that host has a
completion notification path and permits the needed task lifetime. Exit 4 means
end the turn; it must not trigger a new polling cycle. Host deadlines can still
wake the model regardless of CLI silence. The
[Claude handoff](claude-review-wait-handoff.md) requires checking the actual host
and separately addresses enforcement against custom polling scripts.

If the host cannot provide this lifetime and completion delivery, hand back the
review URL and end the turn. The reviewer can use **Copy resume prompt** to resume
the owning chat with a feedback batch. Do not substitute a Monitor or a polling
script that wakes the model on a timer.
