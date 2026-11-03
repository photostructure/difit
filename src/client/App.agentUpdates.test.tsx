import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffCommentThread } from '../types/diff';

import App from './App';

const callbacks = vi.hoisted(() => ({ comments: undefined as (() => Promise<void>) | undefined }));
vi.mock('./hooks/useFileWatch', () => ({
  useFileWatch: (_reload: unknown, comments: () => Promise<void>) => {
    callbacks.comments = comments;
    return {
      shouldReload: false,
      isConnected: true,
      error: null,
      reload: vi.fn(),
      watchState: { isWatchEnabled: false },
    };
  },
}));

const time = '2026-11-03T00:00:00Z';
const messages = (id: string, body: string) => [
  {
    id: `${id}-question`,
    origin: 'user' as const,
    body: 'Please explain',
    createdAt: time,
    updatedAt: time,
  },
  { id, origin: 'agent' as const, author: 'Agent', body, createdAt: time, updatedAt: time },
];

describe('navigating unseen agent replies', () => {
  let threads: DiffCommentThread[];
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/?base=HEAD&target=.');
    vi.stubGlobal(
      'EventSource',
      class {
        close() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    threads = [
      {
        id: 'general',
        scope: 'review',
        createdAt: time,
        updatedAt: time,
        messages: messages('general-answer', 'Agent answer about the whole review'),
      },
      {
        id: 'hidden',
        filePath: 'not-in-diff.ts',
        position: { side: 'new', line: 999 },
        createdAt: time,
        updatedAt: time,
        resolution: { resolved: true, updatedAt: time },
        messages: messages('hidden-answer', 'Agent answer about the hidden file'),
      },
    ];
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === '/api/diff')
        return Promise.resolve(
          Response.json({
            commit: 'fixture',
            repositoryId: 'repo',
            baseCommitish: 'HEAD',
            targetCommitish: '.',
            requestedBaseCommitish: 'HEAD',
            requestedTargetCommitish: '.',
            files: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 0, chunks: [] }],
          }),
        );
      if (url.pathname === '/api/comments-json')
        return Promise.resolve(Response.json({ version: 1, threads }));
      if (url.pathname === '/api/comments')
        return Promise.resolve(Response.json({ success: true, version: 1, threads }));
      if (url.pathname === '/api/conversation/snapshot')
        return Promise.resolve(Response.json({ cursor: 'stream:0', reviews: [] }));
      if (url.pathname === '/api/review-summary')
        return Promise.resolve(Response.json({ commitMessage: '', rationale: '', version: 0 }));
      return Promise.resolve(new Response(null, { status: 404 }));
    });
  });

  const mount = () =>
    render(
      <HotkeysProvider initiallyActiveScopes={['navigation']}>
        <App />
      </HotkeysProvider>,
    );

  it('keeps previews unseen, jumps into resolved/outdated conversations, and persists seen revisions', async () => {
    const first = mount();
    const updates = await screen.findByRole('button', { name: '2 new agent updates' });
    fireEvent.click(updates);
    const panel = screen.getByRole('dialog', { name: 'Unseen agent updates' });
    expect(screen.getByRole('button', { name: '2 new agent updates' })).toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole('button', {
        name: /not-in-diff.ts:999.*Agent answer about the hidden file/,
      }),
    );
    expect(await screen.findByRole('dialog', { name: 'Conversation' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-comment-message-id', 'hidden-answer'),
    );
    expect(screen.getByRole('button', { name: '1 new agent update' })).toBeInTheDocument();
    const filter = within(screen.getByRole('dialog', { name: 'Conversation' })).getByRole(
      'combobox',
    );
    fireEvent.change(filter, { target: { value: 'open' } });
    expect(filter).toHaveValue('open');
    expect(screen.queryByText('Agent answer about the hidden file')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close conversation' }));
    fireEvent.click(screen.getByRole('button', { name: '1 new agent update' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Unseen agent updates' })).getByRole('button', {
        name: /Review conversation.*Agent answer about the whole review/,
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('data-comment-message-id', 'general-answer'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close conversation' }));
    expect(screen.getByRole('button', { name: 'Agent updates' })).toBeEnabled();
    first.unmount();

    mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Agent updates' })).toBeEnabled(),
    );
    expect(screen.queryByRole('button', { name: /new agent update/ })).not.toBeInTheDocument();
    threads = structuredClone(threads);
    threads[1]!.messages[1]!.body = 'A corrected answer about the hidden file';
    await act(async () => {
      await callbacks.comments?.();
    });
    expect(await screen.findByRole('button', { name: '1 new agent update' })).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/conversation/status')),
    ).toBe(false);
  });
});
