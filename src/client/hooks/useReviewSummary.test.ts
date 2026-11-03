import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReviewSummary } from '../../types/conversation';

import { useReviewSummary } from './useReviewSummary';

const initial: ReviewSummary = {
  commitMessage: 'feat: show review context',
  rationale: 'Reviewers need to know what this change solves.',
  version: 1,
};
const response = (summary: ReviewSummary) => new Response(JSON.stringify(summary));
afterEach(() => vi.unstubAllGlobals());

describe('review summary drafts', () => {
  it('keeps a saved user message when an older committed-message seed arrives on refresh', async () => {
    const saved = { ...initial, commitMessage: 'My saved commit explanation', version: 2 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(saved));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReviewSummary('/api/review-summary?target=abc1234'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    fetchMock.mockResolvedValue(
      response({ ...initial, commitMessage: 'Original Git message\n\nFull body.\n', version: 1 }),
    );

    await act(async () => result.current.refresh());

    expect(result.current.draft.commitMessage).toBe(saved.commitMessage);
    expect(result.current.version).toBe(2);
    expect(result.current.dirty).toBe(false);
  });

  it('saves both fields with the version the user edited', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(initial));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReviewSummary('/api/review-summary?target=a'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.updateDraft({ commitMessage: 'feat: explain review context' }));
    expect(result.current.dirty).toBe(true);
    const saved = { ...initial, commitMessage: 'feat: explain review context', version: 2 };
    fetchMock.mockResolvedValue(response(saved));
    await act(async () => {
      expect(await result.current.save()).toBe(true);
    });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/review-summary?target=a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commitMessage: saved.commitMessage,
        rationale: initial.rationale,
        baseVersion: 1,
      }),
    });
    expect(result.current.dirty).toBe(false);
    expect(result.current.draft.commitMessage).toBe(saved.commitMessage);
  });

  it('keeps a local draft when a remote update arrives and rejects stale saves', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(initial));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReviewSummary('/api/review-summary?target=a'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.updateDraft({ rationale: 'My unsaved explanation' }));
    const latest = { ...initial, commitMessage: 'feat: updated by agent', version: 2 };
    fetchMock.mockResolvedValue(response(latest));
    await act(async () => result.current.refresh());
    expect(result.current.conflict).toBe(true);
    expect(result.current.draft.rationale).toBe('My unsaved explanation');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ summary: latest }), { status: 409 }));
    await act(async () => {
      expect(await result.current.save()).toBe(false);
    });
    expect(result.current.draft.rationale).toBe('My unsaved explanation');
    act(() => result.current.discard());
    expect(result.current.draft.commitMessage).toBe(latest.commitMessage);
    expect(result.current.dirty).toBe(false);
    expect(result.current.conflict).toBe(false);
  });

  it('does not apply a late save to another diff selection', async () => {
    let finishSave: ((response: Response) => void) | undefined;
    const other = { ...initial, commitMessage: 'fix: another review', version: 0 };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (init?.method === 'POST')
        return new Promise((resolve) => {
          finishSave = resolve;
        });
      return response(String(url).endsWith('b') ? other : initial);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result, rerender } = renderHook(({ url }) => useReviewSummary(url), {
      initialProps: { url: '/api/review-summary?target=a' },
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.updateDraft({ rationale: 'Draft for A' }));
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.save();
    });
    rerender({ url: '/api/review-summary?target=b' });
    await waitFor(() => expect(result.current.draft.commitMessage).toBe(other.commitMessage));
    await act(async () => {
      finishSave?.(response({ ...initial, version: 2 }));
      await pending;
    });
    expect(result.current.draft.commitMessage).toBe(other.commitMessage);
    expect(result.current.saving).toBe(false);
  });

  it('preserves a newer server version when an older save response arrives last', async () => {
    let finishSave: ((response: Response) => void) | undefined;
    let remote = initial;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
        if (init?.method === 'POST')
          return new Promise((resolve) => {
            finishSave = resolve;
          });
        return response(remote);
      }),
    );
    const { result } = renderHook(() => useReviewSummary('/api/review-summary?target=a'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.updateDraft({ commitMessage: 'feat: local edit' }));
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.save();
    });
    remote = { ...initial, commitMessage: 'feat: newer agent edit', version: 3 };
    await act(async () => result.current.refresh());
    await act(async () => {
      finishSave?.(response({ ...initial, commitMessage: 'feat: local edit', version: 2 }));
      await pending;
    });
    expect(result.current.draft.commitMessage).toBe(remote.commitMessage);
    expect(result.current.version).toBe(3);
    expect(result.current.dirty).toBe(false);
  });
});
