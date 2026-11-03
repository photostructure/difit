import { useContext, useEffect, useRef } from 'react';

import type { DiffCommentMessage } from '../../types/diff';
import { AgentUpdatesContext } from '../contexts/AgentUpdatesContext';

import { agentMessageRevision } from './useAgentUpdates';

export function useSeenAgentMessage(
  threadId: string,
  message: DiffCommentMessage,
  highlighted: boolean,
) {
  const element = useRef<HTMLDivElement>(null);
  const context = useContext(AgentUpdatesContext);
  const revision = agentMessageRevision(message);
  const latest = useRef({ context, revision, origin: message.origin });
  latest.current = { context, revision, origin: message.origin };
  useEffect(() => {
    const node = element.current;
    if (
      !node ||
      !context?.enabled ||
      message.origin !== 'agent' ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let visible = false;
    let seen = false;
    const observeVisibility = () => {
      if (seen || !visible || document.visibilityState !== 'visible') return;
      seen = true;
      context.markSeen(threadId, message.id, revision);
      observer.disconnect();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.1);
        observeVisibility();
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    document.addEventListener('visibilitychange', observeVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', observeVisibility);
    };
  }, [context, threadId, message.id, message.origin, revision]);
  useEffect(() => {
    if (!highlighted) return;
    const frame = requestAnimationFrame(() => {
      if (!element.current?.isConnected) return;
      element.current.scrollIntoView?.({ block: 'center' });
      element.current.focus({ preventScroll: true });
      // Explicit navigation displays the full message, even without IntersectionObserver.
      const current = latest.current;
      if (
        current.context?.enabled &&
        document.visibilityState === 'visible' &&
        current.origin === 'agent'
      )
        current.context.markSeen(threadId, message.id, current.revision);
    });
    return () => cancelAnimationFrame(frame);
  }, [highlighted, threadId, message.id]);
  return element;
}
