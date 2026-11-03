import { useEffect, useRef } from 'react';
import { useHotkeysContext } from 'react-hotkeys-hook';

import type { AgentUpdate } from '../hooks/useAgentUpdates';

export function AgentUpdatesPanel({
  updates,
  onClose,
  onSelect,
}: {
  updates: AgentUpdate[];
  onClose: () => void;
  onSelect: (update: AgentUpdate) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const { enableScope, disableScope } = useHotkeysContext();
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    disableScope('navigation');
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && panel.current) {
        const buttons = [...panel.current.querySelectorAll<HTMLButtonElement>('button')];
        const first = buttons[0],
          last = buttons.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const element = panel.current;
    element?.addEventListener('keydown', close);
    return () => {
      element?.removeEventListener('keydown', close);
      enableScope('navigation');
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [disableScope, enableScope, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        id="agent-updates-panel"
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Unseen agent updates"
        className="relative h-full w-full max-w-lg overflow-y-auto border-l border-github-border bg-github-bg-primary p-5 shadow-lg"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-github-text-primary">
            Unseen agent updates ({updates.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-github-border px-2 py-1 text-sm text-github-text-primary"
          >
            Close updates
          </button>
        </div>
        <p className="mb-4 text-xs text-github-text-secondary">
          Select an update to read it in its conversation.
        </p>
        {updates.length === 0 ? (
          <p className="text-github-text-secondary">No unseen agent messages.</p>
        ) : (
          <ul className="space-y-3">
            {updates.map((update) => (
              <li key={update.key}>
                <button
                  type="button"
                  onClick={() => onSelect(update)}
                  className="w-full rounded border border-github-border p-3 text-left hover:bg-github-bg-secondary"
                >
                  <span className="mb-1 block text-xs font-medium text-github-text-secondary">
                    {update.thread.scope === 'review'
                      ? 'Review conversation'
                      : `${update.thread.file}:${Array.isArray(update.thread.line) ? update.thread.line[0] : update.thread.line}`}
                  </span>
                  <span className="mb-1 block whitespace-pre-wrap break-words text-sm text-github-text-primary">
                    {update.message.body.length > 240
                      ? `${update.message.body.slice(0, 240)}…`
                      : update.message.body}
                  </span>
                  <span className="text-xs text-github-accent">Read update →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
