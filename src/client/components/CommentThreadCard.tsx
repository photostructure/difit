import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  LoaderCircle,
  MessageSquare,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { type CommentIntent, type CommentThread, type DiffCommentMessage } from '../../types/diff';
import { useClickOutside } from '../hooks/useClickOutside';
import { copyTextToClipboard } from '../utils/clipboard';

import { CommentBodyRenderer } from './CommentBodyRenderer';
import { CommentForm, type CommentSubmitOptions } from './CommentForm';
import type { AppearanceSettings } from './SettingsModal';

interface ThreadMessageItemProps {
  message: DiffCommentMessage;
  isRootMessage?: boolean;
  showAuthorBadge: boolean;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
  filename?: string;
  originalCode?: string;
  onUpdate: (newBody: string, intent: CommentIntent) => void;
  onResolveOrDelete: () => void;
  actionLabel: string;
  confirmPrompt?: string;
  onDelete?: () => void;
  confirmLabel: string;
  onClick?: (e: React.MouseEvent) => void;
}

type PendingAction = 'primary' | 'delete';

function ThreadMessageItem({
  message,
  isRootMessage = false,
  showAuthorBadge,
  syntaxTheme,
  filename,
  originalCode,
  onUpdate,
  onResolveOrDelete,
  actionLabel,
  confirmPrompt,
  onDelete,
  confirmLabel,
  onClick,
}: ThreadMessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const isConfirming = pendingAction !== null;
  const isConfirmingDelete =
    pendingAction === 'delete' || (pendingAction === 'primary' && !isRootMessage);
  const confirmContainerRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const showAuthorHeader = showAuthorBadge && Boolean(message.author);
  const progress = message.origin !== 'agent' ? message.progress : undefined;
  const isUserAuthoredMessage = message.author?.trim() === 'User';
  const intent = message.intent ?? 'comment';
  const [isCopied, setIsCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useClickOutside(confirmContainerRef, () => setPendingAction(null), isConfirming);

  useEffect(() => {
    if (!isConfirming) return;

    confirmButtonRef.current?.focus();

    // Capture phase so Escape only cancels the confirmation and never reaches
    // surrounding Escape handlers (e.g. the CommentsListModal close hotkey).
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setPendingAction(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isConfirming]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await copyTextToClipboard(message.body);
      setIsCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = (nextBody: string, options: CommentSubmitOptions) => {
    const nextIntent = options.intent ?? 'comment';
    if (nextBody !== message.body || nextIntent !== intent) {
      onUpdate(nextBody, nextIntent);
    }
    setIsEditing(false);
    return Promise.resolve();
  };

  return (
    <div className={isEditing ? '' : 'flex min-w-0 items-start gap-3'} onClick={onClick}>
      {!isEditing ? (
        <>
          <div className="min-w-0 flex-1">
            {showAuthorHeader && (
              <div className="mb-2 flex min-w-0 items-center gap-2 pr-2 text-xs text-github-text-secondary">
                <span className="inline-flex items-center rounded-full border border-github-border bg-github-bg-primary px-2 py-0.5 text-[11px] font-medium text-github-text-primary">
                  {message.author}
                </span>
              </div>
            )}

            {(message.intent || isUserAuthoredMessage) && (
              <span className="mb-2 inline-block rounded border border-github-border px-1.5 py-0.5 text-xs text-github-text-secondary">
                {intent === 'question'
                  ? 'Question'
                  : intent === 'change'
                    ? 'Change request'
                    : 'Comment'}
              </span>
            )}
            {progress && (
              <div
                role="status"
                className="mb-2 flex items-center gap-1.5 text-xs text-github-text-secondary"
                title={`Agent progress last updated ${new Date(progress.updatedAt).toLocaleString()}`}
              >
                {(progress.status === 'thinking' || progress.status === 'replying') && (
                  <LoaderCircle
                    aria-hidden="true"
                    size={12}
                    className="animate-spin motion-reduce:animate-none"
                  />
                )}
                {(progress.status === 'replied' || progress.status === 'noted') && (
                  <Check aria-hidden="true" size={12} />
                )}
                <span>{progress.status.charAt(0).toUpperCase() + progress.status.slice(1)}</span>
              </div>
            )}
            <CommentBodyRenderer
              body={message.body}
              originalCode={originalCode}
              filename={filename}
              syntaxTheme={syntaxTheme}
            />
          </div>
          {isConfirming ? (
            <div
              ref={confirmContainerRef}
              className="flex shrink-0 items-center gap-1.5 pt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="whitespace-nowrap text-xs text-github-text-secondary">
                {pendingAction === 'delete' ? 'Delete?' : confirmPrompt}
              </span>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const action = pendingAction;
                  setPendingAction(null);
                  if (action === 'delete') {
                    onDelete?.();
                  } else {
                    onResolveOrDelete();
                  }
                }}
                className={`whitespace-nowrap rounded border border-github-border bg-github-bg-tertiary px-2 py-1 text-xs font-medium transition-all hover:bg-github-bg-primary ${
                  isConfirmingDelete ? 'text-github-danger' : 'text-green-700 hover:text-green-800'
                }`}
              >
                {isConfirmingDelete ? 'Delete' : confirmLabel}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingAction(null);
                }}
                className="whitespace-nowrap rounded border border-github-border bg-github-bg-tertiary px-2 py-1 text-xs text-github-text-primary transition-all hover:bg-github-bg-primary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-start gap-2 pt-0.5">
              {!isRootMessage && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded border border-github-border bg-github-bg-tertiary p-1.5 text-github-text-primary transition-all hover:bg-github-bg-primary"
                  title={isCopied ? 'Copied!' : 'Copy message'}
                  aria-label={isCopied ? 'Copied!' : 'Copy message'}
                >
                  {isCopied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              )}
              {(isUserAuthoredMessage || isRootMessage) && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="rounded border border-github-border bg-github-bg-tertiary p-1.5 text-github-text-primary transition-all hover:bg-github-bg-primary"
                  title="Edit message"
                >
                  <Edit2 size={12} />
                </button>
              )}
              {(isRootMessage || isUserAuthoredMessage) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirmPrompt) {
                      setPendingAction('primary');
                      return;
                    }
                    onResolveOrDelete();
                  }}
                  className={`rounded border border-github-border bg-github-bg-tertiary p-1.5 transition-all hover:bg-github-bg-primary ${
                    isRootMessage ? 'text-green-700 hover:text-green-800' : 'text-github-danger'
                  }`}
                  title={actionLabel}
                  aria-label={actionLabel}
                >
                  {isRootMessage ? <Check size={12} /> : <Trash2 size={12} />}
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingAction('delete');
                  }}
                  className="rounded border border-github-border bg-github-bg-tertiary p-1.5 text-github-danger transition-all hover:bg-github-bg-primary"
                  title="Delete thread"
                  aria-label="Delete thread"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <CommentForm
          onSubmit={handleSaveEdit}
          onCancel={handleCancelEdit}
          selectedCode={originalCode}
          syntaxTheme={syntaxTheme}
          filename={filename}
          initialValue={message.body}
          initialIntent={intent}
          embedded={true}
          title="Edit comment"
          submitLabel="Save"
          placeholder="Edit your message..."
        />
      )}
    </div>
  );
}

interface CommentThreadCardProps {
  thread: CommentThread;
  showAuthorBadges?: boolean;
  confirmRootAction?: boolean;
  onGeneratePrompt: (thread: CommentThread) => string;
  onToggleThreadResolved: (threadId: string) => void;
  onRemoveThread?: (threadId: string) => void;
  onReplyToThread: (threadId: string, body: string, intent?: CommentIntent) => Promise<void>;
  onRemoveMessage: (threadId: string, messageId: string) => void;
  onUpdateMessage: (
    threadId: string,
    messageId: string,
    newBody: string,
    intent?: CommentIntent,
  ) => void;

  onClick?: (e: React.MouseEvent) => void;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
}

export function CommentThreadCard({
  thread,
  showAuthorBadges = false,
  confirmRootAction = true,
  onGeneratePrompt,
  onToggleThreadResolved,
  onRemoveThread,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,

  onClick,
  syntaxTheme,
}: CommentThreadCardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(Boolean(thread.resolution?.resolved));
  useEffect(() => {
    setIsCollapsed(Boolean(thread.resolution?.resolved));
  }, [thread.resolution?.resolved]);
  const lineLabel = Array.isArray(thread.line)
    ? `${thread.line[0]}-${thread.line[1]}`
    : thread.line;

  const toggleCollapsed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCollapsed((prev) => !prev);
  };

  const handleCopyThread = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const prompt = onGeneratePrompt(thread);
      await copyTextToClipboard(prompt);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy thread prompt:', error);
    }
  };

  const rootMessage = thread.messages[0];
  if (!rootMessage) return null;

  return (
    <div
      id={`comment-thread-${thread.id}`}
      className={`rounded-md border border-yellow-600/50 border-l-4 border-l-yellow-400 bg-github-bg-tertiary p-3 shadow-sm transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={onClick}
    >
      <div className={`flex items-center justify-between gap-3 ${isCollapsed ? '' : 'mb-3'}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-github-text-secondary">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand thread' : 'Collapse thread'}
            title={isCollapsed ? 'Expand thread' : 'Collapse thread'}
            className="shrink-0 rounded p-0.5 text-github-text-secondary transition-colors hover:bg-github-bg-primary hover:text-github-text-primary"
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <span
            className="font-mono px-1 py-0.5 rounded overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              backgroundColor: 'var(--color-yellow-path-bg)',
              color: 'var(--color-yellow-path-text)',
            }}
          >
            {thread.scope === 'review' ? 'Review conversation' : `${thread.file}:${lineLabel}`}
          </span>
          {thread.resolution?.resolved && (
            <>
              <span className="text-github-text-muted">Resolved</span>
              <button
                type="button"
                className="text-github-accent"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleThreadResolved(thread.id);
                }}
              >
                Reopen
              </button>
            </>
          )}
          {thread.isOutdated && (
            <span
              className="inline-flex h-5 shrink-0 items-center rounded-full border border-github-text-muted px-2 text-[10px] font-medium text-github-text-muted"
              title="Code has changed since this comment was made"
              aria-label="Outdated comment"
            >
              Outdated
            </span>
          )}
          {isCollapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              title="Expand thread"
            >
              <span className="min-w-0 flex-1 truncate text-github-text-secondary">
                {rootMessage.body.split('\n')[0]}
              </span>
              <span
                className="inline-flex shrink-0 items-center gap-1 text-github-text-muted"
                aria-label={`${thread.messages.length} messages in thread`}
              >
                <MessageSquare size={12} />
                {thread.messages.length}
              </span>
            </button>
          )}
        </div>
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyThread}
              className="whitespace-nowrap rounded px-2 py-1 text-xs transition-all"
              style={{
                backgroundColor: 'var(--color-yellow-btn-bg)',
                color: 'var(--color-yellow-btn-text)',
                border: '1px solid var(--color-yellow-btn-border)',
              }}
              title="Copy thread prompt for AI coding agent"
            >
              <span className="inline-flex items-center gap-1">
                <Copy size={12} />
                {isCopied ? 'Copied!' : 'Copy Prompt'}
              </span>
            </button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div className="space-y-3">
          <ThreadMessageItem
            message={{
              ...rootMessage,
              intent: rootMessage.intent ?? (thread.isQuestion ? 'question' : undefined),
            }}
            isRootMessage={true}
            showAuthorBadge={showAuthorBadges}
            syntaxTheme={syntaxTheme}
            filename={thread.file}
            originalCode={thread.codeContent}
            onUpdate={(newBody, intent) =>
              onUpdateMessage(thread.id, rootMessage.id, newBody, intent)
            }
            onResolveOrDelete={() => onToggleThreadResolved(thread.id)}
            actionLabel={thread.resolution?.resolved ? 'Reopen thread' : 'Resolve thread'}
            confirmLabel={thread.resolution?.resolved ? 'Reopen' : 'Resolve'}
            confirmPrompt={
              confirmRootAction ? (thread.resolution?.resolved ? 'Reopen?' : 'Resolve?') : undefined
            }
            onDelete={onRemoveThread ? () => onRemoveThread(thread.id) : undefined}
          />

          {thread.messages.slice(1).map((message) => (
            <div key={message.id} className="ml-4 border-l border-github-border pl-3">
              <ThreadMessageItem
                message={message}
                showAuthorBadge={showAuthorBadges}
                syntaxTheme={syntaxTheme}
                filename={thread.file}
                originalCode={thread.codeContent}
                onUpdate={(newBody, intent) =>
                  onUpdateMessage(thread.id, message.id, newBody, intent)
                }
                onResolveOrDelete={() => onRemoveMessage(thread.id, message.id)}
                actionLabel="Delete reply"
                confirmLabel="Delete"
                confirmPrompt="Delete?"
              />
            </div>
          ))}

          <div
            className="ml-4 border-l border-github-border pl-3"
            onClick={(e) => e.stopPropagation()}
          >
            {isReplying ? (
              <CommentForm
                onSubmit={async (body, options) => {
                  await onReplyToThread(thread.id, body, options.intent);
                  setIsReplying(false);
                }}
                onCancel={() => setIsReplying(false)}
                selectedCode={thread.codeContent}
                syntaxTheme={syntaxTheme}
                filename={thread.file}
                embedded={true}
                title="Reply to thread"
                submitLabel="Send"
                placeholder="Write a reply..."
              />
            ) : (
              <button
                type="button"
                data-reply-trigger="true"
                onFocus={() => setIsReplying(true)}
                onClick={() => setIsReplying(true)}
                className="w-full cursor-text rounded border border-github-border bg-github-bg-secondary px-3 py-1.5 text-left text-sm text-github-text-muted transition-colors hover:border-github-text-secondary"
              >
                Write a reply...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
