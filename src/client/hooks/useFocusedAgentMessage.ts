import { useEffect, useRef } from 'react';

export function useFocusedAgentMessage(
  messageId: string,
  highlighted: boolean,
  focusRequest?: number,
) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlighted) return;
    const frame = requestAnimationFrame(() => {
      if (!element.current?.isConnected) return;
      element.current.scrollIntoView?.({ block: 'center' });
      element.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [highlighted, messageId, focusRequest]);
  return element;
}
