import { createHash, randomUUID } from 'node:crypto';

import type { Express } from 'express';

import type {
  ConversationEvent,
  ConversationStreamEvent,
  ConversationSnapshot,
  ReviewApproval,
  ReviewSummary,
} from '../types/conversation.js';
import type { CommentProgress, DiffCommentThread, DiffSelection } from '../types/diff.js';
import { getDiffSelectionKey } from '../utils/diffSelection.js';

interface Review {
  id: string;
  selection: DiffSelection;
  threads: DiffCommentThread[];
  progress: Map<string, CommentProgress>;
  approval: ReviewApproval;
  summary: ReviewSummary;
}

/** Process-local review state and live events. Revision tokens change after server restart. */
export class Conversation {
  private readonly streamId = randomUUID();
  private sequence = 0;
  private readonly reviews = new Map<string, Review>();
  constructor(private readonly onEvent?: (event: ConversationStreamEvent) => void) {}

  private emit(event: ConversationStreamEvent): void {
    this.onEvent?.(event);
  }

  private getReview(selection: DiffSelection): Review {
    const key = getDiffSelectionKey(selection);
    let review = this.reviews.get(key);
    if (!review) {
      review = {
        id: randomUUID(),
        selection: { ...selection },
        threads: [],
        progress: new Map<string, CommentProgress>(),
        approval: { approved: false },
        summary: { commitMessage: '', rationale: '', version: 0 },
      };
      this.reviews.set(key, review);
    }
    return review;
  }

  getApproval(selection: DiffSelection): ReviewApproval {
    return { ...this.getReview(selection).approval };
  }

  getSummary(selection: DiffSelection): ReviewSummary {
    return { ...this.getReview(selection).summary };
  }

  setSummary(selection: DiffSelection, summary: ReviewSummary, origin: 'user' | 'agent'): void {
    const review = this.getReview(selection);
    review.summary = { ...summary };
    this.sequence += 1;
    this.emit({
      type: 'review.summary',
      origin,
      cursor: this.cursor,
      reviewId: review.id,
      selection: { ...selection },
      summary: { ...summary },
      timestamp: new Date().toISOString(),
    });
  }

  setApproval(
    selection: DiffSelection,
    approved: boolean,
    origin: 'user' | 'agent' = 'user',
  ): ReviewApproval {
    const review = this.getReview(selection);
    if (review.approval.approved === approved) return { ...review.approval };
    this.sequence += 1;
    const timestamp = new Date().toISOString();
    review.approval = { approved, cursor: this.cursor, updatedAt: timestamp };
    this.emit({
      type: 'review.approval',
      origin,
      cursor: this.cursor,
      reviewId: review.id,
      selection: { ...selection },
      approved,
      timestamp,
    });
    return { ...review.approval };
  }

  update(
    selection: DiffSelection,
    previous: DiffCommentThread[],
    next: DiffCommentThread[],
    origin: ConversationEvent['origin'],
  ): void {
    const review = this.getReview(selection);
    review.threads = next;
    const liveKeys = new Set(
      next.flatMap((thread) =>
        thread.messages.map((message) => JSON.stringify([thread.id, message.id])),
      ),
    );
    for (const key of review.progress.keys()) {
      if (!liveKeys.has(key)) review.progress.delete(key);
    }
    const pending: ConversationStreamEvent[] = [];
    for (const thread of next) {
      const oldThread = previous.find((candidate) => candidate.id === thread.id);
      for (const message of thread.messages) {
        const oldMessage = oldThread?.messages.find((candidate) => candidate.id === message.id);
        if (oldMessage?.body === message.body && oldMessage.intent === message.intent) continue;
        this.sequence += 1;
        const progressKey = JSON.stringify([thread.id, message.id]);
        if ((message.origin ?? origin) === 'user') {
          review.progress.set(progressKey, {
            status: 'queued',
            cursor: this.cursor,
            updatedAt: new Date().toISOString(),
          });
        } else {
          review.progress.delete(progressKey);
        }
        pending.push({
          type: oldMessage ? 'comment.updated' : 'comment.created',
          cursor: this.cursor,
          origin: message.origin ?? origin,
          reviewId: review.id,
          selection: { ...selection },
          threadId: thread.id,
          messageId: message.id,
          scope: thread.scope,
          intent: message.intent,
          file: thread.filePath,
          side: thread.position?.side,
          line: thread.position ? structuredClone(thread.position.line) : undefined,
          body: message.body,
          author: message.author,
          codeSnapshot: thread.codeSnapshot ? { ...thread.codeSnapshot } : undefined,
          timestamp: new Date().toISOString(),
        });
      }
    }
    for (const thread of next) {
      const oldThread = previous.find((candidate) => candidate.id === thread.id);
      for (const message of oldThread?.messages ?? []) {
        if (thread.messages.some((candidate) => candidate.id === message.id)) continue;
        this.sequence += 1;
        pending.push({
          type: 'comment.deleted',
          cursor: this.cursor,
          origin,
          reviewId: review.id,
          selection: { ...selection },
          threadId: thread.id,
          messageId: message.id,
          timestamp: new Date().toISOString(),
        });
      }
    }
    for (const thread of next) {
      const oldThread = previous.find((candidate) => candidate.id === thread.id);
      if (Boolean(oldThread?.resolution?.resolved) === Boolean(thread.resolution?.resolved))
        continue;
      this.sequence += 1;
      pending.push({
        type: thread.resolution?.resolved ? 'thread.resolved' : 'thread.reopened',
        origin,
        cursor: this.cursor,
        reviewId: review.id,
        selection: { ...selection },
        threadId: thread.id,
        timestamp: new Date().toISOString(),
      });
    }
    for (const oldThread of previous) {
      if (!next.some((thread) => thread.id === oldThread.id)) {
        this.sequence += 1;
        pending.push({
          type: 'thread.deleted',
          origin,
          cursor: this.cursor,
          reviewId: review.id,
          selection: { ...selection },
          threadId: oldThread.id,
          timestamp: new Date().toISOString(),
        });
      }
    }
    for (const event of pending) this.emit(event);
  }

  get cursor(): string {
    return `${this.streamId}:${this.sequence}`;
  }

  findReview(id: string): Review | undefined {
    return [...this.reviews.values()].find((review) => review.id === id);
  }

  snapshot(): ConversationSnapshot {
    return {
      cursor: this.cursor,
      reviews: [...this.reviews.values()].map((review) => ({
        id: review.id,
        selection: { ...review.selection },
        threads: structuredClone(this.withProgress(review.selection, review.threads)),
        approval: { ...review.approval },
        summary: { ...review.summary },
      })),
    };
  }

  withProgress(selection: DiffSelection, threads: DiffCommentThread[]): DiffCommentThread[] {
    const review = this.reviews.get(getDiffSelectionKey(selection));
    return threads.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) => {
        const progress = review?.progress.get(JSON.stringify([thread.id, message.id]));
        return { ...message, progress: progress ? { ...progress } : undefined };
      }),
    }));
  }

  setProgress(
    reviewId: string,
    threadId: string,
    messageId: string,
    cursor: string,
    status: CommentProgress['status'],
  ): DiffSelection | undefined {
    const review = this.findReview(reviewId);
    const progress = review?.progress.get(JSON.stringify([threadId, messageId]));
    if (!review || !progress) throw new ProgressError(404, 'User comment no longer exists');
    if (progress.cursor !== cursor)
      throw new ProgressError(409, 'Comment changed; read its latest event or snapshot');
    const order: CommentProgress['status'][] = [
      'queued',
      'delivered',
      'read',
      'thinking',
      'replying',
      'noted',
      'replied',
    ];
    // Replayed deliveries and delayed status requests must not move progress backwards.
    if (order.indexOf(status) <= order.indexOf(progress.status)) return undefined;
    const updated = { status, cursor, updatedAt: new Date().toISOString() };
    review.progress.set(JSON.stringify([threadId, messageId]), updated);
    this.sequence += 1;
    this.emit({
      type: 'comment.progress',
      origin: 'agent',
      cursor: this.cursor,
      reviewId,
      selection: { ...review.selection },
      threadId,
      messageId,
      progress: { ...updated },
      timestamp: updated.updatedAt,
    });
    return review.selection;
  }
}

class ProgressError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function registerConversationRoutes(
  app: Express,
  conversation: Conversation,
  update: (selection: DiffSelection, threads: DiffCommentThread[]) => void,
  progressChanged: (selection: DiffSelection) => void,
): void {
  app.get('/api/conversation/snapshot', (_req, res) => {
    res.json(conversation.snapshot());
  });

  app.post('/api/conversation/status', (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Status updates require application/json' });
      return;
    }
    const input = req.body as Record<string, unknown> | null;
    if (
      !input ||
      typeof input.reviewId !== 'string' ||
      typeof input.threadId !== 'string' ||
      typeof input.messageId !== 'string' ||
      typeof input.cursor !== 'string' ||
      typeof input.status !== 'string' ||
      !['delivered', 'read', 'thinking', 'replying', 'noted'].includes(input.status)
    ) {
      res.status(400).json({
        error:
          'Expected reviewId, threadId, messageId, cursor, and status (delivered, read, thinking, replying, noted)',
      });
      return;
    }
    try {
      const selection = conversation.setProgress(
        input.reviewId,
        input.threadId,
        input.messageId,
        input.cursor,
        input.status as CommentProgress['status'],
      );
      if (selection) progressChanged(selection);
      res.json({ success: true });
    } catch (error) {
      if (!(error instanceof ProgressError)) throw error;
      res.status(error.status).json({ error: error.message });
    }
  });

  app.post('/api/conversation/reply', (req, res) => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Replies require application/json' });
      return;
    }
    const input = req.body as Record<string, unknown> | null;
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.reviewId !== 'string' ||
      typeof input.threadId !== 'string' ||
      typeof input.inReplyTo !== 'string' ||
      typeof input.body !== 'string' ||
      !input.body.trim() ||
      (input.cursor !== undefined && typeof input.cursor !== 'string') ||
      (input.author !== undefined && (typeof input.author !== 'string' || !input.author.trim()))
    ) {
      res.status(400).json({
        error: 'Expected reviewId, threadId, inReplyTo, body, and optional cursor and author',
      });
      return;
    }
    const review = conversation.findReview(input.reviewId);
    const thread = review?.threads.find((candidate) => candidate.id === input.threadId);
    if (!review || !thread || !thread.messages.some((message) => message.id === input.inReplyTo)) {
      res.status(404).json({ error: 'Review, thread, or parent message no longer exists' });
      return;
    }
    const progress = review.progress.get(JSON.stringify([thread.id, input.inReplyTo]));
    if (input.cursor !== undefined && progress?.cursor !== input.cursor) {
      res.status(409).json({ error: 'Comment changed; read its latest event or snapshot' });
      return;
    }
    // Retrying a reply after a lost HTTP response must not duplicate the answer.
    const author = typeof input.author === 'string' ? input.author.trim() : 'Agent';
    const id = createHash('sha256')
      .update(
        JSON.stringify([
          review.id,
          thread.id,
          input.inReplyTo,
          input.body,
          author,
          ...(input.cursor ? [input.cursor] : []),
        ]),
      )
      .digest('hex');
    if (!thread.messages.some((message) => message.id === id)) {
      const now = new Date().toISOString();
      const message = {
        id,
        body: input.body,
        origin: 'agent' as const,
        author,
        createdAt: now,
        updatedAt: now,
      };
      update(
        review.selection,
        review.threads.map((candidate) =>
          candidate.id === thread.id
            ? { ...candidate, updatedAt: now, messages: [...candidate.messages, message] }
            : candidate,
        ),
      );
    }
    // Only revision-aware replies can attest that the current wording was answered.
    if (
      progress &&
      input.cursor === progress.cursor &&
      conversation.setProgress(review.id, thread.id, input.inReplyTo, progress.cursor, 'replied')
    )
      progressChanged(review.selection);
    res.json({ success: true, reviewId: review.id, threadId: thread.id, messageId: id });
  });
}
