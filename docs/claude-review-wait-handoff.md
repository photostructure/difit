Continue the guided review that used 22 difit servers. Replace the timed polling
workflow with one event-driven background waiter owned by the main Claude
session. The target is zero model wakes while review state is unchanged.

Codex restored the bounded conversation event journal and
`GET /api/conversation/events` in `/home/mrm/src/difit`. The rebuilt CLI has
`difit wait`. Its implementation and contract are in
`/home/mrm/src/difit/docs/waiting-for-review.md`.

1. Review current Git status and recent commits before making changes. Leave
   `/home/mrm/src/difit/skills/difit/SKILL.md` and
   `/home/mrm/src/difit/docs/agent-conversations.md` alone; Matthew is reviewing
   their uncommitted edits separately. Use only `/home/mrm/.local/bin/difit`,
   from each reviewed repository's Git root. Read `difit wait --help`.

2. Inventory the existing reviews: repository, API host and port, review ID, browser URL,
   proposed summary, approval/capture versions, and process ownership. Save their
   conversation snapshots and pending work before changing anything. Do not
   stop, restart or replace the existing review servers as part of this handoff.
   The installed build `5.1.0-local.20261028.f3d4a302f332` has the event endpoint,
   but the new guarded waiter also requires presence reporting in snapshots and
   event batches. Endpoint compatibility alone is insufficient. Verify each
   actual server's support once. Rebuilding the CLI does not upgrade those processes. A server without
   `/api/conversation/events` needs a migration; identify those servers once,
   preserve their state, and report the concrete migration needed. Do not loop
   on unsupported-server errors or replace frozen reviews with a new working-tree
   diff. Approval from an old server is not approval of a new server's capture.

   Companion commands now accept `--host`: use the hostname or IP and API port
   from the actual server URL for `comment snapshot`, `comment status`,
   `comment reply`, and `wait`. A server bound to `10.1.1.24` is reachable with
   `--host 10.1.1.24`; localhost is only the default. Rebuilding the CLI is enough
   for this client-side address fix and requires no server restart.

3. Account for every outstanding human message, including replies and edits.
   Preserve each review/thread/message ID and exact revision cursor in the
   pending-work record before acknowledging delivery. Messages already marked
   Delivered or Read still need reconciliation against your saved work and
   replies; the waiter automatically recovers only messages still Queued. IDs
   already exist; no UUID migration is needed. Address comments within the
   existing authorization and review scope.

4. The main session must start the waiter itself. If you are a subagent, hand
   review ownership and pending work to the parent once server lifetime has been
   accounted for; the parent starts the waiter. Returning IDs alone does not make
   child processes independent of their owner. Do not create another background
   subagent whose job is to remain awake while Matthew reviews.

5. For servers that support the endpoint, reconcile an initial snapshot and keep
   its cursor for each port. Start exactly one Bash command using
   `run_in_background: true`, with no timeout wrapper or overall deadline. The
   command is `/home/mrm/.local/bin/difit wait --host <actual-host>` with repeated `--port` and
   `--after port=cursor` arguments for the actual ports and saved cursors. Let the
   harness deliver task completion. Do not run a foreground polling loop, add a
   periodically expiring Monitor, repeatedly query TaskOutput, or issue scheduled
   status checks. Verify the current host supports the required background-task
   lifetime. Read that session's Bash tool definition, including what its
   `timeout` parameter means for background tasks, and verify its Claude Code
   version and session mode. Current [Claude Code documentation](https://code.claude.com/docs/en/tools-reference#time-limit-for-background-commands)
   distinguishes local attended sessions with unlimited background tasks from
   capped unattended sessions; older versions can differ. If this host imposes
   a background deadline, report the exact limit once and leave a handoff. Do
   not install a waiter that will expire and repeatedly wake the model. A
   two-hour timeout and automatic restart do not meet the requested target.
   Without the required host support, end the turn with the review URL and let
   Matthew resume the main session with the browser's **Copy resume prompt**.

6. On exit 0, read the single `wait.events` JSON result. Save that port's returned
   stream cursor and retain the other ports' checkpoints. Record the batch as
   pending work, then send explicit receipts using each message's revision
   cursor. Handle human comments/edits, LGTM approval or revocation, and saved
   summary changes. Reconcile current state before acting on stale events.
   Honor the existing approval and commit rules. After handling the batch,
   start one new background waiter with the saved per-port cursors.

7. Exit 1 means arguments, protocol or server support need correction. Exit 2
   means a connection failed or a server exited. Exit 3 requires snapshot and
   pending-work reconciliation before using the fresh snapshot cursor. Exit 4
   means every selected review is unattended with no human work returned: end
   the turn and resume on human feedback. Do not re-arm on absence. Diagnose
   terminal errors once; do not automatically restart the waiter in an error
   loop. Empty HTTP responses and agent activity are handled silently inside
   `difit wait` and never need a model turn.

Report the inventory, recovered pending comments, unsupported servers or host
limitations, and the single background task ID when installed. Then use the
host's completion notification path without periodic checks. Do not build a
daemon or resume-session router as part of this work.

High-priority follow-up: Matthew reports several thousand dollars spent on a
polling agent while no review browser was open. Establish a Claude-specific
integration that cannot recreate that supported-path failure. Verify one actual
feedback event causes one model wake, and no events cause no model wakes. Use the
real host's background-completion mechanism only if it meets that requirement;
otherwise evaluate its supported push/event integration. Keep the waiting and
presence observation in ordinary code, outside model turns. Presence alone does
not prohibit an agent from inventing its own polling script. Investigate a host
enforcement boundary for such scripts and distinguish a real invocation limit
from a hook rejection that simply wakes the model again. Prepare the concrete
host changes and validation evidence before proposing broader settings changes.
Do not weaken the target to periodic wakeups or make absence an auto-retry signal.
