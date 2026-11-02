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
