import type { CommentThread, DeletedComment, DiffCommentThread } from '../../types/diff';

export function insertBeforeFollowing<T extends { id: string }>(
  items: T[],
  item: T,
  followingIds: string[],
  precedingIds: string[],
): T[] {
  if (items.some((current) => current.id === item.id)) return items;
  const nextId = followingIds.find((id) => items.some((current) => current.id === id));
  const previousId = [...precedingIds]
    .reverse()
    .find((id) => items.some((current) => current.id === id));
  const index =
    nextId !== undefined
      ? items.findIndex((current) => current.id === nextId)
      : previousId !== undefined
        ? items.findIndex((current) => current.id === previousId) + 1
        : 0;
  return [...items.slice(0, index), item, ...items.slice(index)];
}

type DisplayThread = DiffCommentThread & Pick<CommentThread, 'deleted' | 'deletedMessageIds'>;

/** Keep undo placeholders in the viewer while API payloads contain only live comments. */
export function includeDeletedComments(
  threads: DiffCommentThread[],
  deleted: DeletedComment[],
): DisplayThread[] {
  let result: DisplayThread[] = [...threads];
  for (const entry of [...deleted].reverse()) {
    if (entry.messageId !== undefined) continue;
    result = insertBeforeFollowing(
      result,
      { ...entry.thread, deleted: true },
      entry.followingIds,
      entry.precedingIds,
    );
  }
  for (const entry of [...deleted].reverse()) {
    if (entry.messageId === undefined) continue;
    const message = entry.thread.messages.find((item) => item.id === entry.messageId);
    if (!message) continue;
    result = result.map((thread) => {
      if (thread.id !== entry.thread.id || thread.messages.some((item) => item.id === message.id))
        return thread;
      return {
        ...thread,
        messages: insertBeforeFollowing(
          thread.messages,
          message,
          entry.followingIds,
          entry.precedingIds,
        ),
        deletedMessageIds: [...(thread.deletedMessageIds ?? []), message.id],
      };
    });
  }
  return result;
}
