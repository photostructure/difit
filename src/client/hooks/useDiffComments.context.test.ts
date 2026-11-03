import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useDiffComments } from './useDiffComments';

describe('comment context isolation', () => {
  it('retains thread anchors and stamps new roots as a named capture advances', () => {
    const { result, rerender } = renderHook(
      ({ capture }) =>
        useDiffComments(
          'review:task',
          'review:task',
          'review:task',
          undefined,
          'repo',
          undefined,
          capture,
        ),
      { initialProps: { capture: { version: 1, patchDigest: 'first' } } },
    );
    act(() =>
      result.current.addThread({
        filePath: 'file.ts',
        side: 'new',
        line: 1,
        body: 'Original inline question',
      }),
    );
    rerender({ capture: { version: 2, patchDigest: 'second' } });
    expect(result.current.threads[0]?.capture).toEqual({ version: 1, patchDigest: 'first' });
    act(() => result.current.addReviewThread('New general question'));
    expect(result.current.threads[1]?.capture).toEqual({ version: 2, patchDigest: 'second' });
    expect(result.current.threads[0]?.messages[0]?.body).toBe('Original inline question');
  });

  beforeEach(() => localStorage.clear());

  it('never reports the previous review comments as loaded for a new selection', () => {
    const observed: Array<{ target: string; loaded: boolean; bodies: string[] }> = [];
    const { result, rerender } = renderHook(
      ({ target }) => {
        const comments = useDiffComments('base', target, undefined, undefined, 'repo');
        observed.push({
          target,
          loaded: comments.hasLoadedComments,
          bodies: comments.threads.map((thread) => thread.messages[0]!.body),
        });
        return comments;
      },
      { initialProps: { target: 'review-a' } },
    );
    act(() => result.current.addReviewThread('Review A question'));
    rerender({ target: 'review-b' });
    expect(observed.filter((entry) => entry.target === 'review-b' && entry.loaded)).toEqual(
      expect.arrayContaining([expect.objectContaining({ bodies: [] })]),
    );
    expect(
      observed.some(
        (entry) =>
          entry.target === 'review-b' && entry.loaded && entry.bodies.includes('Review A question'),
      ),
    ).toBe(false);
    act(() => result.current.addReviewThread('Review B question'));
    rerender({ target: 'review-a' });
    expect(result.current.threads[0]?.messages[0]?.body).toBe('Review A question');
    rerender({ target: 'review-b' });
    expect(result.current.threads[0]?.messages[0]?.body).toBe('Review B question');
  });

  it('ignores a stale replacement callback after the user changes reviews', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useDiffComments('base', target, undefined, undefined, 'repo'),
      { initialProps: { target: 'review-a' } },
    );
    act(() => result.current.addReviewThread('Review A question'));
    const staleReplace = result.current.replaceThreads;
    const staleThreads = structuredClone(result.current.threads);
    staleThreads[0]!.messages[0]!.body = 'Late response from review A';
    rerender({ target: 'review-b' });
    act(() => result.current.addReviewThread('Review B question'));
    act(() => staleReplace(staleThreads));
    expect(result.current.threads[0]?.messages[0]?.body).toBe('Review B question');
    rerender({ target: 'review-a' });
    expect(result.current.threads[0]?.messages[0]?.body).toBe('Review A question');
  });
});

describe('comment deletion undo', () => {
  beforeEach(() => localStorage.clear());

  it('removes deleted content from live data and prompts, then restores it after reopening', () => {
    const view = renderHook(() => useDiffComments('base', 'feature', undefined, undefined, 'repo'));
    act(() => view.result.current.addReviewThread('Root question', { intent: 'question' }));
    const root = view.result.current.threads[0]!;
    act(() => view.result.current.replyToThread({ threadId: root.id, body: 'Delete this reply' }));
    const reply = view.result.current.threads[0]!.messages[1]!;
    act(() => view.result.current.removeMessage(root.id, reply.id));
    expect(view.result.current.threads[0]!.messages.map((message) => message.body)).toEqual([
      'Root question',
    ]);
    expect(view.result.current.generateAllCommentsPrompt()).not.toContain('Delete this reply');
    expect(view.result.current.deletedComments).toHaveLength(1);
    view.unmount();

    const reopened = renderHook(() =>
      useDiffComments('base', 'feature', undefined, undefined, 'repo'),
    );
    expect(reopened.result.current.deletedComments).toHaveLength(1);
    act(() => reopened.result.current.updateMessage(root.id, root.id, 'Edited root', 'change'));
    act(() => reopened.result.current.replyToThread({ threadId: root.id, body: 'New reply' }));
    act(() => reopened.result.current.restoreComment(root.id, reply.id));
    expect(reopened.result.current.threads[0]!.messages.map((message) => message.body)).toEqual([
      'Edited root',
      'Delete this reply',
      'New reply',
    ]);
    expect(reopened.result.current.threads[0]!.messages[1]!.id).toBe(reply.id);
    expect(reopened.result.current.deletedComments).toHaveLength(0);
  });

  it('keeps independent undo copies for adjacent threads and preserves their order', () => {
    const { result } = renderHook(() =>
      useDiffComments('base', 'feature', undefined, undefined, 'repo'),
    );
    for (const body of ['A', 'B', 'C']) act(() => result.current.addReviewThread(body));
    const [a, b] = result.current.threads;
    act(() => result.current.removeThread(a!.id));
    act(() => result.current.removeThread(b!.id));
    expect(result.current.threads.map((thread) => thread.messages[0]!.body)).toEqual(['C']);
    expect(result.current.generateAllCommentsPrompt()).not.toContain('A');
    act(() => result.current.addReviewThread('New thread'));
    act(() => result.current.restoreComment(a!.id));
    act(() => result.current.restoreComment(b!.id));
    expect(result.current.threads.map((thread) => thread.messages[0]!.body)).toEqual([
      'A',
      'B',
      'C',
      'New thread',
    ]);
    expect(result.current.threads[0]!.id).toBe(a!.id);
  });

  it('retains a deleted reply when deleting and restoring its entire thread', () => {
    const { result } = renderHook(() =>
      useDiffComments('base', 'feature', undefined, undefined, 'repo'),
    );
    act(() => result.current.addReviewThread('Root'));
    const id = result.current.threads[0]!.id;
    act(() => result.current.replyToThread({ threadId: id, body: 'Reply' }));
    const replyId = result.current.threads[0]!.messages[1]!.id;
    act(() => result.current.removeMessage(id, replyId));
    act(() => result.current.removeThread(id));
    expect(result.current.threads).toEqual([]);
    act(() => result.current.restoreComment(id));
    expect(result.current.threads[0]!.messages).toHaveLength(1);
    act(() => result.current.restoreComment(id, replyId));
    expect(result.current.threads[0]!.messages.map((message) => message.body)).toEqual([
      'Root',
      'Reply',
    ]);
  });

  it('isolates undo across reviews and rejects a restore callback from the prior review', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useDiffComments('base', target, undefined, undefined, 'repo'),
      { initialProps: { target: 'A' } },
    );
    act(() => result.current.addReviewThread('Only in A'));
    const id = result.current.threads[0]!.id;
    act(() => result.current.removeThread(id));
    const staleRestore = result.current.restoreComment;
    rerender({ target: 'B' });
    expect(result.current.deletedComments).toEqual([]);
    act(() => staleRestore(id));
    expect(result.current.threads).toEqual([]);
    rerender({ target: 'A' });
    expect(result.current.deletedComments).toHaveLength(1);
    act(() => result.current.restoreComment(id));
    expect(result.current.threads[0]!.messages[0]!.body).toBe('Only in A');
  });
});

it('restores the latest deletion after the same thread was reintroduced by synchronization', () => {
  localStorage.clear();
  const { result } = renderHook(() =>
    useDiffComments('base', 'repeated-delete', undefined, undefined, 'repo'),
  );
  act(() => result.current.addReviewThread('First version'));
  const thread = result.current.threads[0]!;
  act(() => result.current.removeThread(thread.id));
  act(() =>
    result.current.replaceThreads([
      { ...thread, messages: [{ ...thread.messages[0]!, body: 'New version' }] },
    ]),
  );
  act(() => result.current.removeThread(thread.id));
  expect(result.current.deletedComments).toHaveLength(1);
  act(() => result.current.restoreComment(thread.id));
  expect(result.current.threads[0]!.messages[0]!.body).toBe('New version');
});
