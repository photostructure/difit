import { act, render } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DiffCommentMessage } from '../../types/diff';
import { AgentUpdatesContext, type AgentUpdatesReadState } from '../contexts/AgentUpdatesContext';

import { agentMessageRevision } from './useAgentUpdates';
import { useSeenAgentMessage } from './useSeenAgentMessage';

const message: DiffCommentMessage = {
  id: 'answer',
  origin: 'agent',
  body: 'The answer',
  createdAt: '2026-11-03T00:00:00Z',
  updatedAt: '2026-11-03T00:00:00Z',
};

function Message() {
  const ref = useSeenAgentMessage('thread', message, false);
  return <div ref={ref}>{message.body}</div>;
}

function ObservedMessage({ enabled, markSeen }: AgentUpdatesReadState) {
  const state = useMemo(() => ({ enabled, markSeen }), [enabled, markSeen]);
  return (
    <AgentUpdatesContext.Provider value={state}>
      <Message />
    </AgentUpdatesContext.Provider>
  );
}

describe('observing agent messages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits for a visible tab and an unobscured message, without sending receipts', () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const markSeen = vi.fn();
    const { rerender } = render(<ObservedMessage enabled markSeen={markSeen} />);
    act(() =>
      observerCallback?.(
        [{ isIntersecting: true, intersectionRatio: 0.2 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(markSeen).not.toHaveBeenCalled();
    rerender(<ObservedMessage enabled={false} markSeen={markSeen} />);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(markSeen).not.toHaveBeenCalled();
    rerender(<ObservedMessage enabled markSeen={markSeen} />);
    act(() =>
      observerCallback?.(
        [{ isIntersecting: true, intersectionRatio: 0.001 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(markSeen).not.toHaveBeenCalled();
    act(() =>
      observerCallback?.(
        [{ isIntersecting: true, intersectionRatio: 0.2 } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(markSeen).toHaveBeenCalledExactlyOnceWith(
      'thread',
      message.id,
      agentMessageRevision(message),
    );
    expect(disconnect).toHaveBeenCalled();
  });
});
