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
import React, { useEffect, useId, useRef, useState } from 'react';

import { type CommentIntent, type CommentThread, type DiffCommentMessage } from '../../types/diff';
import { copyTextToClipboard } from '../utils/clipboard';
import { useSeenAgentMessage } from '../hooks/useSeenAgentMessage';

import { CommentBodyRenderer } from './CommentBodyRenderer';
import { CommentForm, type CommentSubmitOptions } from './CommentForm';
import type { AppearanceSettings } from './SettingsModal';

// One-click answers to an agent reply. They are ordinary replies, so agents
// receive, acknowledge, and answer them like typed ones.
const QUICK_REPLIES: readonly { label: string; body: string; intent: CommentIntent }[] = [
  { label: '👍 Agreed', body: '👍 Agreed: no reply needed.', intent: 'comment' },
  {
    label: '❓ Still unclear',
    body: '❓ Still unclear: please explain again in different words.',
    intent: 'question',
  },
  {
    label: '👎 Disagree',
    body: '👎 Disagree: please reconsider, or defend the point.',
    intent: 'question',
  },
];

interface ThreadMessageItemProps {
  threadId: string;
  highlighted?: boolean;
  message: DiffCommentMessage;
  isRootMessage?: boolean;
  showAuthorBadge: boolean;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
  filename?: string;
  originalCode?: string;
  onUpdate: (newBody: string, intent: CommentIntent) => void;
  onResolveOrDelete: () => void;
  actionLabel: string;
  onDelete?: () => void;
  onClick?: (e: React.MouseEvent) => void;
}

function ThreadMessageItem({
  threadId,
  highlighted = false,
  message,
  isRootMessage = false,
  showAuthorBadge,
  syntaxTheme,
  filename,
  originalCode,
  onUpdate,
  onResolveOrDelete,
  actionLabel,
  onDelete,
  onClick,
}: ThreadMessageItemProps) {
  const messageElement = useSeenAgentMessage(threadId, message, highlighted);
  const [isEditing, setIsEditing] = useState(false);
  const showAuthorHeader = showAuthorBadge && Boolean(message.author);
  const progress = message.origin !== 'agent' ? message.progress : undefined;
  const isUserAuthoredMessage = message.author?.trim() === 'User';
  const intent = message.intent ?? 'comment';
  const [isCopied, setIsCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

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
    <div
      ref={messageElement}
      tabIndex={-1}
      data-comment-message-id={message.id}
      className={`${isEditing ? '' : 'flex min-w-0 items-start gap-3'} ${highlighted ? 'rounded ring-2 ring-blue-500 ring-offset-2 ring-offset-github-bg-tertiary' : ''}`}
      onClick={onClick}
    >
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
                  onDelete();
                }}
                className="rounded border border-github-border bg-github-bg-tertiary p-1.5 text-github-danger transition-all hover:bg-github-bg-primary"
                title="Delete thread"
                aria-label="Delete thread"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
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
  focusedMessageId?: string;
  thread: CommentThread;
  showAuthorBadges?: boolean;
  onGeneratePrompt: (thread: CommentThread) => string;
  onToggleThreadResolved: (threadId: string) => void;
  onRemoveThread?: (threadId: string) => void;
  onRestoreComment?: (threadId: string, messageId?: string) => void;
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
  focusedMessageId,
  thread,
  showAuthorBadges = false,
  onGeneratePrompt,
  onToggleThreadResolved,
  onRemoveThread,
  onRestoreComment,
  onReplyToThread,
  onRemoveMessage,
  onUpdateMessage,

  onClick,
  syntaxTheme,
}: CommentThreadCardProps) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const contentId = useId();
  const [isCollapsed, setIsCollapsed] = useState(
    Boolean(thread.deleted || (thread.resolution?.resolved && !focusedMessageId)),
  );
  useEffect(() => {
    setIsCollapsed(Boolean(thread.deleted || (thread.resolution?.resolved && !focusedMessageId)));
  }, [focusedMessageId, thread.deleted, thread.resolution?.resolved]);
  const [isReplying, setIsReplying] = useState(false);
  const replyArea = useRef<HTMLDivElement>(null);
  const replyTrigger = useRef<HTMLButtonElement>(null);
  const returnFocusToReplyTrigger = useRef(false);
  useEffect(() => {
    if (isReplying || !returnFocusToReplyTrigger.current) return;
    returnFocusToReplyTrigger.current = false;
    replyTrigger.current?.focus();
  }, [isReplying]);
  const agentRepliedLast =
    thread.messages.filter((message) => !thread.deletedMessageIds?.includes(message.id)).at(-1)
      ?.origin === 'agent';
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
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy thread prompt:', error);
    }
  };

  const rootMessage = thread.messages[0];
  if (!rootMessage) return null;

  return (
    <div
      id={`comment-thread-${thread.id}`}
      data-comment-thread-id={thread.id}
      data-comment-deleted={thread.deleted || undefined}
      tabIndex={-1}
      onFocus={(event) => {
        if (event.target === event.currentTarget && !thread.deleted) setIsCollapsed(false);
      }}
      className={`rounded-md border border-yellow-600/50 border-l-4 border-l-yellow-400 bg-github-bg-tertiary p-3 shadow-sm transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={onClick}
    >
      <div className={`flex items-center justify-between gap-3 ${isCollapsed ? '' : 'mb-3'}`}>
        <button
          type="button"
          onClick={toggleCollapsed}
          disabled={thread.deleted}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
          aria-label={isCollapsed ? 'Expand thread' : 'Collapse thread'}
          title={isCollapsed ? 'Expand thread' : 'Collapse thread'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded p-0.5 text-left text-xs text-github-text-secondary transition-colors hover:bg-github-bg-primary hover:text-github-text-primary"
        >
          <span className="shrink-0">
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
          <span
            className="font-mono px-1 py-0.5 rounded overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              backgroundColor: 'var(--color-yellow-path-bg)',
              color: 'var(--color-yellow-path-text)',
            }}
          >
            {thread.scope === 'review' ? 'Review conversation' : `${thread.file}:${lineLabel}`}
          </span>
          {thread.deleted ? (
            <span>Deleted</span>
          ) : (
            thread.resolution?.resolved && <span className="text-github-text-muted">Resolved</span>
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
            <span className="flex min-w-0 flex-1 items-center gap-2">
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
            </span>
          )}
        </button>
        {(thread.deleted || thread.resolution?.resolved || !isCollapsed) && (
          <div className="flex shrink-0 items-center gap-2">
            {thread.deleted ? (
              <button
                type="button"
                className="rounded border border-github-border bg-github-bg-primary px-2 py-1 text-xs text-github-text-primary hover:bg-github-bg-secondary"
                onClick={(event) => {
                  event.stopPropagation();
                  onRestoreComment?.(thread.id);
                }}
              >
                Undelete
              </button>
            ) : (
              thread.resolution?.resolved && (
                <button
                  type="button"
                  className="text-xs text-github-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleThreadResolved(thread.id);
                  }}
                >
                  Reopen
                </button>
              )
            )}
            {!isCollapsed && (
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
            )}
          </div>
        )}
      </div>

      <div id={contentId} hidden={isCollapsed} className="space-y-3">
        {!isCollapsed && (
          <>
            <ThreadMessageItem
              threadId={thread.id}
              highlighted={focusedMessageId === rootMessage.id}
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
              onDelete={onRemoveThread ? () => onRemoveThread(thread.id) : undefined}
            />

            {thread.messages.slice(1).map((message) => (
              <div key={message.id} className="ml-4 border-l border-github-border pl-3">
                {thread.deletedMessageIds?.includes(message.id) ? (
                  <div
                    className="flex items-center justify-between gap-3 text-xs text-github-text-secondary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span>Reply deleted</span>
                    <button
                      type="button"
                      className="rounded border border-github-border bg-github-bg-primary px-2 py-1 text-github-text-primary hover:bg-github-bg-secondary"
                      onClick={() => onRestoreComment?.(thread.id, message.id)}
                    >
                      Undelete
                    </button>
                  </div>
                ) : (
                  <ThreadMessageItem
                    threadId={thread.id}
                    highlighted={focusedMessageId === message.id}
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
                  />
                )}
              </div>
            ))}

            <div
              ref={replyArea}
              className="ml-4 border-l border-github-border pl-3"
              onClick={(e) => e.stopPropagation()}
            >
              {isReplying ? (
                <CommentForm
                  onSubmit={async (body, options) => {
                    await onReplyToThread(thread.id, body, options.intent);
                    setIsReplying(false);
                  }}
                  onCancel={(draft) => {
                    if (draft.trim()) return;
                    // Escape returns focus to the reply field; an outside click keeps its target.
                    returnFocusToReplyTrigger.current =
                      replyArea.current?.contains(document.activeElement) ?? false;
                    setIsReplying(false);
                  }}
                  selectedCode={thread.codeContent}
                  syntaxTheme={syntaxTheme}
                  filename={thread.file}
                  embedded={true}
                  title="Reply to thread"
                  submitLabel="Send"
                  placeholder="Write a reply..."
                />
              ) : (
                <div role="group" aria-label="Reply" className="flex flex-wrap items-center gap-2">
                  {agentRepliedLast &&
                    QUICK_REPLIES.map(({ label, body, intent }) => (
                      <button
                        key={label}
                        type="button"
                        title={`Send "${body}" as a ${intent}`}
                        onClick={() => {
                          onReplyToThread(thread.id, body, intent).catch((error: unknown) => {
                            console.error('Failed to send quick reply:', error);
                          });
                        }}
                        className="whitespace-nowrap rounded-full border border-github-border bg-github-bg-secondary px-3 py-1 text-xs text-github-text-primary transition-colors hover:border-github-text-secondary hover:bg-github-bg-primary"
                      >
                        {label}
                      </button>
                    ))}
                  <button
                    ref={replyTrigger}
                    type="button"
                    onClick={() => setIsReplying(true)}
                    className="min-w-40 flex-1 cursor-text rounded border border-github-border bg-github-bg-secondary px-3 py-1.5 text-left text-sm text-github-text-muted transition-colors hover:border-github-text-secondary"
                  >
                    Write a reply...
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
