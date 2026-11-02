import { useCallback, useEffect, useRef, useState } from 'react';

import type { ReviewApproval } from '../../types/conversation';
import type { NamedReviewMetadata } from '../../types/review';

type CaptureIdentity = Pick<NamedReviewMetadata, 'version' | 'patchDigest'>;

/** Server-owned approval, bound to the displayed selection and captured patch. */
export function useReviewApproval(
  url: string | null,
  capture?: CaptureIdentity,
  displayedSummaryVersion?: number,
) {
  const captureVersion = capture?.version;
  const patchDigest = capture?.patchDigest;
  const key = JSON.stringify([url, captureVersion, patchDigest, displayedSummaryVersion]);
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
    async (approved: boolean, summaryVersion = 0) => {
      if (!url || activeKey.current !== key)
        throw new Error('Approval is unavailable for this capture');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          ...(approved || captureVersion !== undefined ? { summaryVersion } : {}),
          ...(captureVersion !== undefined ? { captureVersion, patchDigest } : {}),
        }),
      });
      if (!response.ok) throw new Error('Could not update approval');
      await refresh();
    },
    [url, key, captureVersion, patchDigest, refresh],
  );

  const current = state?.key === key ? state.approval : null;
  const matchesCapture =
    captureVersion === undefined ||
    (current?.captureVersion === captureVersion &&
      current.patchDigest === patchDigest &&
      (displayedSummaryVersion === undefined ||
        current.summaryVersion === displayedSummaryVersion));
  return {
    approved: current?.approved === true && matchesCapture,
    ready: current !== null,
    error,
    refresh,
    setApproved,
  };
}
