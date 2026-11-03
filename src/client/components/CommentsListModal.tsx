import { X } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useHotkeys, useHotkeysContext } from 'react-hotkeys-hook';

import type { CommentIntent, CommentThread } from '../../types/diff';
import { hasActiveTextSelection } from '../utils/domUtils';

import { CommentForm, type CommentSubmitOptions } from './CommentForm';
import { CommentThreadCard } from './CommentThreadCard';
import type { AppearanceSettings } from './SettingsModal';

interface CommentsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGeneralComment?: (body: string, options: CommentSubmitOptions) => Promise<void>;
  onNavigate: (thread: CommentThread) => void;
  comments: CommentThread[];
  showAuthorBadges?: boolean;
  onToggleThreadResolved: (threadId: string) => void;
  onRemoveThread?: (threadId: string) => void;
  onGenerateThreadPrompt: (thread: CommentThread) => string;
  onReplyToThread: (threadId: string, body: string, intent?: CommentIntent) => Promise<void>;
  onRemoveMessage: (threadId: string, messageId: string) => void;
  onUpdateMessage: (
    threadId: string,
    messageId: string,
    newBody: string,
    intent?: CommentIntent,
  ) => void;

  syntaxTheme?: AppearanceSettings['syntaxTheme'];
}

export function CommentsListModal({
  isOpen,
  onClose,
  onAddGeneralComment,
  onNavigate,
  comments,
  showAuthorBadges = false,
  onToggleThreadResolved,
  onRemoveThread,
  onGenerateThreadPrompt,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,

  syntaxTheme,
}: CommentsListModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [generalDraft, setGeneralDraft] = useState<{
    body: string;
    intent: CommentIntent;
  }>({ body: '', intent: 'comment' });
  const commentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    if (isOpen) dialogRef.current?.focus();
  }, [isOpen]);

  const sortedThreads = comments
    .filter(
      (thread) =>
        filter === 'all' || Boolean(thread.resolution?.resolved) === (filter === 'resolved'),
    )
    .sort((a, b) => {
      const fileCompare = (a.file ?? '').localeCompare(b.file ?? '');
      if (fileCompare !== 0) return fileCompare;

      const aLine = Array.isArray(a.line) ? a.line[0] : a.line;
      const bLine = Array.isArray(b.line) ? b.line[0] : b.line;
      if (aLine !== bLine) return (aLine ?? 0) - (bLine ?? 0);

      return a.createdAt.localeCompare(b.createdAt);
    });

  useEffect(() => {
    setSelectedIndex((index) => Math.max(0, Math.min(index, sortedThreads.length - 1)));
  }, [sortedThreads.length]);

  const handleThreadClick = useCallback(
    (thread: CommentThread) => {
      if (thread.scope === 'review') return;
      onNavigate(thread);
      onClose();
    },
    [onClose, onNavigate],
  );

  const handleRemoveThread = useCallback(
    (threadId: string) => {
      onRemoveThread?.(threadId);
      if (selectedIndex >= sortedThreads.length - 1 && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    },
    [onRemoveThread, selectedIndex, sortedThreads.length],
  );

  const handleToggleResolution = useCallback(
    (thread: CommentThread) => {
      onToggleThreadResolved(thread.id);
    },
    [onToggleThreadResolved],
  );

  useEffect(() => {
    if (isOpen) {
      enableScope('comments-list');
      disableScope('navigation');
    } else {
      enableScope('navigation');
      disableScope('comments-list');
      setSelectedIndex(0);
    }

    return () => {
      enableScope('navigation');
      disableScope('comments-list');
    };
  }, [disableScope, enableScope, isOpen]);

  const hotkeyOptions = { scopes: 'comments-list', enableOnFormTags: false };

  useHotkeys('escape', () => onClose(), hotkeyOptions, [onClose]);

  useHotkeys(
    'j, down',
    () => setSelectedIndex((prev) => Math.min(prev + 1, sortedThreads.length - 1)),
    hotkeyOptions,
    [sortedThreads.length],
  );

  useHotkeys('k, up', () => setSelectedIndex((prev) => Math.max(prev - 1, 0)), hotkeyOptions, []);

  useHotkeys(
    'enter',
    () => {
      if (sortedThreads[selectedIndex]) {
        handleThreadClick(sortedThreads[selectedIndex]);
      }
    },
    {
      ...hotkeyOptions,
      ignoreEventWhen: (event: KeyboardEvent) =>
        event.target instanceof Element &&
        event.target.closest('button, a, [role="button"]') !== null,
    },
    [handleThreadClick, selectedIndex, sortedThreads],
  );

  useHotkeys(
    'd',
    () => {
      if (sortedThreads[selectedIndex]) {
        handleToggleResolution(sortedThreads[selectedIndex]);
      }
    },
    hotkeyOptions,
    [handleToggleResolution, selectedIndex, sortedThreads],
  );

  useEffect(() => {
    if (commentRefs.current[selectedIndex]) {
      commentRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-title"
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border border-github-border bg-github-bg-primary shadow-lg"
      >
        <div className="sticky top-0 border-b border-github-border bg-github-bg-primary px-6 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="conversation-title" className="text-lg font-semibold text-github-text-primary">
              Conversation
            </h2>
            <button
              onClick={onClose}
              className="text-github-text-secondary transition-colors hover:text-github-text-primary"
              aria-label="Close conversation"
            >
              <X size={20} />
            </button>
          </div>
          <div className="text-xs text-github-text-secondary">
            <span className="font-mono">j/k</span> or <span className="font-mono">↑/↓</span> to
            navigate • <span className="font-mono">Enter</span> to jump •{' '}
            <span className="font-mono">d</span> to resolve/reopen •{' '}
            <span className="font-mono">Esc</span> to close
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-6">
            <label className="mb-4 flex items-center gap-2 text-xs text-github-text-secondary">
              Show
              <select
                aria-label="Conversation filter"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as typeof filter);
                  setSelectedIndex(0);
                }}
                className="rounded border border-github-border bg-github-bg-secondary p-1"
              >
                <option value="all">All conversations</option>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
            {onAddGeneralComment && (
              <div className="mb-6">
                <CommentForm
                  embedded
                  submitLabel="Send"
                  value={generalDraft.body}
                  onChange={(nextBody) =>
                    setGeneralDraft((current) => {
                      const body =
                        typeof nextBody === 'function' ? nextBody(current.body) : nextBody;
                      return body === current.body ? current : { ...current, body };
                    })
                  }
                  intentValue={generalDraft.intent}
                  onIntentChange={(intent) =>
                    setGeneralDraft((current) => ({ ...current, intent }))
                  }
                  dismissOnOutsideClick={false}
                  autoFocus={false}
                  title="General comment or question"
                  placeholder="Comment or ask about this review…"
                  onSubmit={async (body, options) => {
                    const submittedDraft = generalDraft;
                    await onAddGeneralComment(body, options);
                    setGeneralDraft((current) =>
                      current === submittedDraft ? { body: '', intent: 'comment' } : current,
                    );
                  }}
                  onCancel={() => {
                    setGeneralDraft({ body: '', intent: 'comment' });
                    onClose();
                  }}
                />
              </div>
            )}

            {sortedThreads.length === 0 ? (
              <p className="text-center text-github-text-secondary">No comments yet</p>
            ) : (
              <>
                <div className="space-y-2">
                  {sortedThreads.map((thread, index) => (
                    <div
                      key={thread.id}
                      ref={(el) => {
                        commentRefs.current[index] = el;
                      }}
                      className={selectedIndex === index ? 'rounded ring-2 ring-blue-500' : ''}
                    >
                      <CommentThreadCard
                        thread={thread}
                        showAuthorBadges={showAuthorBadges}
                        onGeneratePrompt={onGenerateThreadPrompt}
                        onRemoveThread={onRemoveThread ? handleRemoveThread : undefined}
                        onToggleThreadResolved={onToggleThreadResolved}
                        onReplyToThread={onReplyToThread}
                        onRemoveMessage={onRemoveMessage}
                        onUpdateMessage={onUpdateMessage}
                        syntaxTheme={syntaxTheme}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Selecting text inside a card fires a click as well; do not
                          // treat it as a request to navigate and close the modal.
                          if (hasActiveTextSelection()) return;
                          setSelectedIndex(index);
                          handleThreadClick(thread);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 border-t border-github-border pt-4 text-center text-xs text-github-text-secondary">
                  {selectedIndex + 1} of {sortedThreads.length} threads
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
