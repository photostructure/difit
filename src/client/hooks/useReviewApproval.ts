import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApprovalMode, ReviewApproval } from '../../types/conversation';
import type { NamedReviewMetadata } from '../../types/review';

type CaptureIdentity = Pick<NamedReviewMetadata, 'version' | 'patchDigest'>;

/** The staged or worktree diff changed after it was displayed; reload it before approving. */
export class DiffChangedError extends Error {
  constructor() {
    super('The diff changed after it was displayed');
  }
}

/** Server-owned approval, bound to the displayed selection and captured patch. */
export function useReviewApproval(
  url: string | null,
  capture?: CaptureIdentity,
  displayedSummaryVersion?: number,
  diffDigest?: string,
) {
  const captureVersion = capture?.version;
  const patchDigest = capture?.patchDigest;
  const key = JSON.stringify([
    url,
    captureVersion,
    patchDigest,
    displayedSummaryVersion,
    diffDigest,
  ]);
  const [state, setState] = useState<{ key: string; approval: ReviewApproval } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const activeKey = useRef(key);
  activeKey.current = key;

  const refresh = useCallback(async () => {
    if (!url || activeKey.current !== key) return;
    const id = ++requestId.current;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load approval');
      const approval = (await response.json()) as ReviewApproval;
      if (typeof approval.approved !== 'boolean') throw new Error('Invalid approval response');
      if (id === requestId.current && activeKey.current === key) {
        setState({ key, approval });
        setError(null);
      }
    } catch {
      if (id === requestId.current && activeKey.current === key) {
        setState(null);
        setError('Could not load approval. Refresh the review to retry.');
      }
    }
  }, [url, key]);

  useEffect(() => {
    setState(null);
    setError(null);
    void refresh();
    return () => {
      requestId.current += 1;
    };
  }, [refresh]);

  const setApproved = useCallback(
    async (approved: boolean, summaryVersion = 0, mode: ApprovalMode = 'as-is') => {
      if (!url || activeKey.current !== key)
        throw new Error('Approval is unavailable for this capture');
      const destination = new URL(url, window.location.origin);
      if (approved && mode === 'after-comments') destination.pathname = '/api/approval/conditional';
      const requestUrl =
        approved && mode === 'after-comments'
          ? url.startsWith('/')
            ? `${destination.pathname}${destination.search}`
            : destination.href
          : url;
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          ...(approved && mode === 'after-comments' ? { mode } : {}),
          ...(approved || captureVersion !== undefined ? { summaryVersion } : {}),
          ...(captureVersion !== undefined ? { captureVersion, patchDigest } : {}),
          ...(approved && diffDigest !== undefined ? { diffDigest } : {}),
        }),
      });
      if (response.status === 409) {
        const body = (await response.json()) as { diffDigest?: unknown };
        if (typeof body.diffDigest === 'string') throw new DiffChangedError();
      }
      if (!response.ok) throw new Error('Could not update approval');
      await refresh();
    },
    [url, key, captureVersion, patchDigest, diffDigest, refresh],
  );

  const current = state?.key === key ? state.approval : null;
  const matchesCapture =
    captureVersion === undefined ||
    (current?.captureVersion === captureVersion &&
      current.patchDigest === patchDigest &&
      (displayedSummaryVersion === undefined ||
        current.summaryVersion === displayedSummaryVersion));
  return {
    conditionalSupported: current?.conditionalSupported === true,
    mode: current?.mode,
    requested: matchesCapture && Boolean(current?.requested || current?.approved),
    pendingCount: current?.conditions?.filter((condition) => !condition.addressed).length ?? 0,
    approved: current?.approved === true && matchesCapture,
    ready: current !== null,
    error,
    refresh,
    setApproved,
  };
}
