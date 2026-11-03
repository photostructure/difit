import { Command, InvalidArgumentError } from 'commander';

import type {
  ConversationBatch,
  ConversationSnapshot,
  ConversationStreamEvent,
  WaitResult,
} from '../types/conversation.js';

class WaitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

function collectPort(value: string, ports: number[] = []): number[] {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new InvalidArgumentError('Expected an integer from 1 to 65535');
  return [...ports, port];
}

function isActionable(event: ConversationStreamEvent): boolean {
  return (
    event.origin === 'user' &&
    (event.type === 'comment.created' ||
      event.type === 'comment.updated' ||
      event.type === 'review.approval' ||
      event.type === 'review.summary')
  );
}

async function request<T>(port: number, path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`http://localhost:${port}/api/conversation/${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    // Read the body under the same deadline as the headers.
    const body = (await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return null;
      throw error;
    })) as (T & { error?: string }) | null;
    if (response.status === 409)
      throw new WaitError(
        `Port ${port}: ${body?.error ?? 'Cursor no longer valid'}; run comment snapshot before waiting again`,
        3,
      );
    if (response.status === 404)
      throw new WaitError(
        `Port ${port}: this server does not support conversation waiting; it needs a build with /api/conversation/events and conversation mode enabled`,
        1,
      );
    if (!response.ok)
      throw new WaitError(
        `Port ${port}: ${body?.error ?? `Conversation request failed (${response.status})`}`,
        1,
      );
    if (!body) throw new WaitError(`Port ${port}: invalid conversation response`, 1);
    return body;
  } catch (error) {
    if (error instanceof WaitError) throw error;
    throw new WaitError(
      `Port ${port}: conversation connection failed (server exited or request failed); inspect the server before waiting again`,
      2,
    );
  }
}

/** Recover work that predates the subscription without acknowledging its delivery. */
function queuedMessages(snapshot: ConversationSnapshot): ConversationStreamEvent[] {
  return snapshot.reviews.flatMap((review) =>
    review.threads.flatMap((thread) =>
      thread.messages.flatMap((message): ConversationStreamEvent[] => {
        if (message.progress?.status !== 'queued') return [];
        return [
          {
            type: 'comment.updated',
            origin: 'user',
            cursor: message.progress.cursor,
            reviewId: review.id,
            selection: review.selection,
            threadId: thread.id,
            messageId: message.id,
            body: message.body,
            intent: message.intent,
            author: message.author,
            scope: thread.scope,
            file: thread.filePath,
            side: thread.position?.side,
            line: thread.position?.line,
            codeSnapshot: thread.codeSnapshot,
            capture: review.capture,
            anchorCapture: thread.capture,
            timestamp: message.updatedAt,
          },
        ];
      }),
    ),
  );
}

async function waitForPort(
  port: number,
  after: string | undefined,
  signal: AbortSignal,
): Promise<WaitResult> {
  const snapshot = await request<ConversationSnapshot>(port, 'snapshot', signal);
  if (typeof snapshot.cursor !== 'string' || !Array.isArray(snapshot.reviews))
    throw new WaitError(`Port ${port}: invalid conversation snapshot`, 1);
  const queued = queuedMessages(snapshot);
  let cursor = after ?? snapshot.cursor;
  while (!signal.aborted) {
    const query = new URLSearchParams({ after: cursor, wait: queued.length ? '0' : '25000' });
    const batch = await request<ConversationBatch>(port, `events?${query}`, signal);
    if (typeof batch.cursor !== 'string' || !Array.isArray(batch.events))
      throw new WaitError(`Port ${port}: invalid conversation event batch`, 1);
    // Keep stream cursors separate from the exact revision cursors used for receipts.
    cursor = batch.cursor;
    const events = [
      ...new Map(
        [...queued, ...batch.events.filter(isActionable)].map((event) => [event.cursor, event]),
      ).values(),
    ];
    if (events.length) return { type: 'wait.events', port, events, cursor };
    // Empty HTTP rounds and agent-only batches stay inside this process, silently.
  }
  throw new Error('Wait cancelled');
}

export function createWaitCommand(): Command {
  return new Command('wait')
    .description(
      'Wait silently for human review activity on one or more servers, then print one JSON batch',
    )
    .requiredOption('--port <port>', 'API port to wait on; repeat for several servers', collectPort)
    .option(
      '--after <cursor>',
      'resume after a cursor; use port=cursor for several servers (repeatable)',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .addHelpText(
      'after',
      `
There is no overall timeout. Empty HTTP responses, agent replies/progress, thread
changes and deletions do not finish the wait or produce output. Queued messages
are recovered from a snapshot on every invocation; no delivery receipt is sent.
Without --after, approval and summary changes are watched from attachment onward.
Save the result's port and cursor and pass them to --after on the next invocation
to include changes made between waits. Keep each server's last returned cursor.
Expired/restarted cursors require explicit snapshot reconciliation.

Exit codes: 0 = nonempty human-event batch; 1 = usage/protocol error;
2 = connection failure/server exit; 3 = cursor reconciliation required.
Run one background command in the owning main session, without a shell timeout.
`,
    )
    .action(async (options: { port: number[]; after: string[] }) => {
      const abort = new AbortController();
      try {
        const ports = [...new Set(options.port)];
        const cursors = new Map<number, string>();
        for (const value of options.after) {
          const separator = value.indexOf('=');
          const port =
            separator < 0
              ? ports.length === 1
                ? ports[0]
                : undefined
              : Number(value.slice(0, separator));
          const cursor = separator < 0 ? value : value.slice(separator + 1);
          if (port === undefined || !ports.includes(port) || !cursor || cursors.has(port))
            throw new WaitError(
              'Use one --after cursor for a single port, or --after port=cursor once per selected port',
              1,
            );
          cursors.set(port, cursor);
        }
        const result = await Promise.race(
          ports.map((port) => waitForPort(port, cursors.get(port), abort.signal)),
        );
        console.log(JSON.stringify(result));
      } catch (error) {
        console.error(
          `Error: ${error instanceof Error ? error.message : 'Conversation wait failed'}`,
        );
        process.exitCode = error instanceof WaitError ? error.exitCode : 1;
      } finally {
        abort.abort();
      }
    });
}
