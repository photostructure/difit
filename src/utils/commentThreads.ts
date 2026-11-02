import type { CommentThread, DiffCommentThread } from '../types/diff.js';

export function toCommentThread(thread: DiffCommentThread): CommentThread {
  const common = {
    capture: thread.capture,
    id: thread.id,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    codeContent: thread.codeSnapshot?.content,
    messages: thread.messages,
    resolution: thread.resolution,
    isQuestion: thread.isQuestion,
  };
  if (thread.scope === 'review') return { ...common, scope: 'review' };
  return {
    ...common,
    file: thread.filePath,
    line:
      typeof thread.position.line === 'number'
        ? thread.position.line
        : [thread.position.line.start, thread.position.line.end],
    side: thread.position.side,
  };
}
