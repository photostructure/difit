import { useEffect, useState } from 'react';

import type { ReviewPresenceSnapshot } from '../../types/presence';
import { createId } from '../../utils/createId';
import { resolveEventSourceUrl } from '../utils/eventSourceUrl';

export function useReviewPresence(): ReviewPresenceSnapshot | null {
  const [presence, setPresence] = useState<ReviewPresenceSnapshot | null>(null);
  useEffect(() => {
    const tab = createId();
    let stream: EventSource | undefined;
    let stopped = false;
    const reportVisibility = () => {
      if (stopped) return;
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, visible: document.visibilityState === 'visible' }),
        keepalive: true,
      }).catch(() => setPresence(null));
    };
    const connect = () => {
      stream?.close();
      const query = new URLSearchParams({
        tab,
        visible: String(document.visibilityState === 'visible'),
      });
      stream = new EventSource(resolveEventSourceUrl(`/api/heartbeat?${query}`));
      stream.onopen = reportVisibility;
      stream.onmessage = (event) => {
        // Older servers send only the plain heartbeat strings.
        if (!String(event.data).startsWith('{')) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string;
            presence?: ReviewPresenceSnapshot;
          };
          if (message.type === 'presence' && message.presence) setPresence(message.presence);
        } catch {
          setPresence(null);
        }
      };
      // A reused port may now serve another review. Require a reload after disconnect.
      stream.onerror = () => {
        stopped = true;
        stream?.close();
        setPresence(null);
      };
    };
    connect();
    document.addEventListener('visibilitychange', reportVisibility);
    return () => {
      if (!stopped) stream?.close();
      stopped = true;
      document.removeEventListener('visibilitychange', reportVisibility);
    };
  }, []);
  return presence;
}
