import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '../../types/diff';

import { CommentThreadCard } from './CommentThreadCard';
import { copyTextToClipboard } from '../utils/clipboard';
vi.mock('../utils/clipboard', () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}));

const mockThread: CommentThread = {
  id: 'thread-1',
  file: 'src/client/components/CommentThreadCard.tsx',
  line: 80,
  side: 'new',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  codeContent: 'const value = 1;',
  messages: [
    {
      id: 'message-1',
      body: 'Root comment',
      author: 'User',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'message-2',
      body: 'Reply comment',
      author: 'Reviewer',
      createdAt: '2024-01-01T00:01:00Z',
      updatedAt: '2024-01-01T00:01:00Z',
    },
  ],
};

describe('CommentThreadCard', () => {
  it('resolves without invoking the explicit deletion callback', async () => {
    const user = userEvent.setup();
    const onToggleThreadResolved = vi.fn();
    const onRemoveThread = vi.fn();
    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => ''}
        onToggleThreadResolved={onToggleThreadResolved}
        onRemoveThread={onRemoveThread}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Resolve thread' }));
    expect(onToggleThreadResolved).toHaveBeenCalledWith('thread-1');
    expect(onRemoveThread).not.toHaveBeenCalled();
  });
  it('keeps a resolved general conversation available to reopen', async () => {
    const user = userEvent.setup();
    const onToggleThreadResolved = vi.fn();
    render(
      <CommentThreadCard
        thread={{
          id: 'general',
          scope: 'review',
          createdAt: mockThread.createdAt,
          updatedAt: mockThread.updatedAt,
          messages: mockThread.messages,
          resolution: { resolved: true, updatedAt: mockThread.updatedAt },
        }}
        onGeneratePrompt={() => ''}
        onToggleThreadResolved={onToggleThreadResolved}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );
    expect(screen.getByText('Review conversation')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onToggleThreadResolved).toHaveBeenCalledWith('general');
  });
  it('reopens an expanded resolved thread immediately', async () => {
    const user = userEvent.setup();
    const onToggleThreadResolved = vi.fn();
    render(
      <CommentThreadCard
        thread={{ ...mockThread, resolution: { resolved: true, updatedAt: mockThread.updatedAt } }}
        onGeneratePrompt={() => ''}
        onToggleThreadResolved={onToggleThreadResolved}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Expand thread' }));
    await user.click(screen.getByTitle('Reopen thread'));
    expect(onToggleThreadResolved).toHaveBeenCalledWith('thread-1');
  });

  it.each(['queued', 'delivered', 'read', 'thinking', 'replying', 'noted', 'replied'] as const)(
    'shows %s progress even when author badges are hidden',
    (status) => {
      render(
        <CommentThreadCard
          thread={{
            ...mockThread,
            messages: [
              {
                ...mockThread.messages[0]!,
                progress: { status, cursor: 'stream:1', updatedAt: '2026-10-24T00:00:00Z' },
              },
            ],
          }}
          onGeneratePrompt={() => ''}
          onToggleThreadResolved={vi.fn()}
          onReplyToThread={vi.fn()}
          onRemoveMessage={vi.fn()}
          onUpdateMessage={vi.fn()}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        status[0]!.toUpperCase() + status.slice(1),
      );
    },
  );

  it('does not show delete action for replies authored by someone else', () => {
    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    expect(screen.getByText('Reply comment')).toBeInTheDocument();
    expect(screen.queryByTitle('Delete reply')).not.toBeInTheDocument();
  });

  it('allows resolving and updating intent on imported root comments', () => {
    render(
      <CommentThreadCard
        thread={{
          ...mockThread,
          messages: [
            {
              ...mockThread.messages[0]!,
              author: 'Reviewer',
            },
          ],
        }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    expect(screen.getByTitle('Resolve thread')).toBeInTheDocument();
    expect(screen.getByTitle('Edit message')).toBeInTheDocument();
  });

  it('resolves on the first click, collapses, and reopens on the first click', async () => {
    const user = userEvent.setup();
    const onToggleThreadResolved = vi.fn();
    const props = {
      onGeneratePrompt: () => 'thread prompt',
      onToggleThreadResolved,
      onReplyToThread: vi.fn().mockResolvedValue(undefined),
      onRemoveMessage: vi.fn(),
      onUpdateMessage: vi.fn(),
    };
    const view = render(<CommentThreadCard {...props} thread={mockThread} />);
    await user.click(screen.getByTitle('Resolve thread'));
    expect(onToggleThreadResolved).toHaveBeenCalledWith('thread-1');
    expect(screen.queryByText('Resolve?')).not.toBeInTheDocument();
    view.rerender(
      <CommentThreadCard
        {...props}
        thread={{ ...mockThread, resolution: { resolved: true, updatedAt: mockThread.updatedAt } }}
      />,
    );
    expect(screen.queryByText('Reply comment')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onToggleThreadResolved).toHaveBeenCalledTimes(2);
    view.rerender(<CommentThreadCard {...props} thread={mockThread} />);
    expect(screen.getByText('Reply comment')).toBeVisible();
  });

  it('collapses a deleted thread and offers Undelete without navigating', async () => {
    const user = userEvent.setup();
    const onRestoreComment = vi.fn();
    const onClick = vi.fn();
    render(
      <CommentThreadCard
        thread={{ ...mockThread, deleted: true }}
        onGeneratePrompt={() => ''}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
        onRestoreComment={onRestoreComment}
        onClick={onClick}
      />,
    );
    expect(screen.getByText('Deleted')).toBeVisible();
    expect(screen.queryByText('Reply comment')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undelete' }));
    expect(onRestoreComment).toHaveBeenCalledWith('thread-1');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows a compact deleted reply with its own Undelete action', async () => {
    const user = userEvent.setup();
    const onRestoreComment = vi.fn();
    render(
      <CommentThreadCard
        thread={{ ...mockThread, deletedMessageIds: ['message-2'] }}
        onGeneratePrompt={() => ''}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
        onRestoreComment={onRestoreComment}
      />,
    );
    expect(screen.getByText('Reply deleted')).toBeVisible();
    expect(screen.queryByText('Reply comment')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undelete' }));
    expect(onRestoreComment).toHaveBeenCalledWith('thread-1', 'message-2');
  });

  it('collapses the thread into a single line and expands it back', async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse thread' }));

    // Messages and actions are hidden; a one-line summary with the count remains
    expect(screen.queryByText('Reply comment')).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy Prompt/)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Resolve thread')).not.toBeInTheDocument();
    expect(screen.getByText('Root comment')).toBeInTheDocument();
    expect(screen.getByLabelText('2 messages in thread')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand thread' }));

    expect(screen.getByText('Reply comment')).toBeInTheDocument();
    expect(screen.getByTitle('Resolve thread')).toBeInTheDocument();
  });

  it('expands a collapsed thread by clicking the summary line', async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse thread' }));
    await user.click(screen.getByText('Root comment'));

    expect(screen.getByText('Reply comment')).toBeInTheDocument();
  });

  it('does not trigger the card click when toggling collapse', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
        onClick={onClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Collapse thread' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows the "Outdated" badge when the thread is marked outdated', () => {
    render(
      <CommentThreadCard
        thread={{ ...mockThread, isOutdated: true }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    const badge = screen.getByLabelText('Outdated comment');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Outdated');
    expect(badge).toHaveAttribute('title', 'Code has changed since this comment was made');
  });

  it('does not render the "Outdated" badge when the thread is up to date', () => {
    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Outdated comment')).not.toBeInTheDocument();
  });

  it('deletes a user-authored reply on the first click', async () => {
    const user = userEvent.setup();
    const onRemoveMessage = vi.fn();

    render(
      <CommentThreadCard
        thread={{
          ...mockThread,
          messages: [
            mockThread.messages[0]!,
            {
              ...mockThread.messages[1]!,
              author: 'User',
            },
          ],
        }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={onRemoveMessage}
        onUpdateMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle('Delete reply'));

    expect(onRemoveMessage).toHaveBeenCalledWith('thread-1', 'message-2');
  });

  it('deletes the root thread on the first click', async () => {
    const user = userEvent.setup();
    const onRemoveThread = vi.fn();
    const onToggleThreadResolved = vi.fn();

    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={onToggleThreadResolved}
        onRemoveThread={onRemoveThread}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle('Delete thread'));

    expect(onRemoveThread).toHaveBeenCalledWith('thread-1');
    expect(onToggleThreadResolved).not.toHaveBeenCalled();
  });

  it('edits legacy question intent through the same group without a header toggle', async () => {
    const user = userEvent.setup();
    const onUpdateMessage = vi.fn();
    const root = mockThread.messages[0]!;
    render(
      <CommentThreadCard
        thread={{
          ...mockThread,
          isQuestion: true,
          messages: [{ ...root, author: 'Reviewer', origin: 'agent' }],
        }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={onUpdateMessage}
      />,
    );
    expect(screen.getByText('Question', { selector: 'span' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change to a normal comment' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByTitle('Edit message'));
    const editForm = within(screen.getByPlaceholderText('Edit your message...').closest('form')!);
    expect(editForm.getByRole('radio', { name: 'Question' })).toBeChecked();
    await user.click(editForm.getByRole('radio', { name: 'Comment' }));
    await user.click(editForm.getByRole('button', { name: 'Save' }));
    expect(onUpdateMessage).toHaveBeenCalledWith('thread-1', root.id, root.body, 'comment');
  });
});

describe('reply copy actions', () => {
  it('copies the body of a reply authored by someone else', async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onRemoveThread={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    await user.click(screen.getByTitle('Copy message'));

    expect(copyTextToClipboard).toHaveBeenCalledWith('Reply comment');
    expect(screen.getByTitle('Copied!')).toBeInTheDocument();
  });

  it('places the copy action before edit on a user-authored reply', () => {
    render(
      <CommentThreadCard
        thread={{
          ...mockThread,
          messages: [
            mockThread.messages[0]!,
            {
              ...mockThread.messages[1]!,
              author: 'User',
            },
          ],
        }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onRemoveThread={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    const copyButton = screen.getByTitle('Copy message');
    const editButtons = screen.getAllByTitle('Edit message');
    const replyEditButton = editButtons[editButtons.length - 1]!;

    expect(copyButton.nextElementSibling).toBe(replyEditButton);
  });

  it('does not show the copy action on the root comment', () => {
    render(
      <CommentThreadCard
        thread={{ ...mockThread, messages: [mockThread.messages[0]!] }}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onRemoveThread={vi.fn()}
        onReplyToThread={vi.fn().mockResolvedValue(undefined)}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );

    expect(screen.queryByTitle('Copy message')).not.toBeInTheDocument();
  });
});

describe('thread disclosure and persistent replies', () => {
  function renderThread(props: Partial<ComponentProps<typeof CommentThreadCard>> = {}) {
    return render(
      <>
        <button type="button">Outside thread</button>
        <CommentThreadCard
          thread={mockThread}
          onGeneratePrompt={() => 'thread prompt'}
          onToggleThreadResolved={vi.fn()}
          onReplyToThread={vi.fn().mockResolvedValue(undefined)}
          onRemoveMessage={vi.fn()}
          onUpdateMessage={vi.fn()}
          {...props}
        />
      </>,
    );
  }

  it('shows the actual reply form without taking focus', () => {
    renderThread();

    const reply = screen.getByRole('textbox', { name: '' });
    expect(reply).toHaveAttribute('placeholder', 'Write a reply...');
    expect(reply).not.toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Write a reply...' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('keeps the reply form visible and clears it after sending', async () => {
    const user = userEvent.setup();
    const onReplyToThread = vi.fn().mockResolvedValue(undefined);
    const onClick = vi.fn();
    renderThread({ onReplyToThread, onClick });

    const reply = screen.getByPlaceholderText('Write a reply...');
    await user.type(reply, 'A new reply');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(onReplyToThread).toHaveBeenCalledWith('thread-1', 'A new reply', 'comment');
    expect(reply).toBeInTheDocument();
    expect(reply).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('preserves a reply draft across Escape and outside clicks', async () => {
    const user = userEvent.setup();
    renderThread();

    const reply = screen.getByPlaceholderText('Write a reply...');
    await user.type(reply, 'Keep this draft');
    await user.click(screen.getByRole('radio', { name: 'Question' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Outside thread' }));

    expect(reply).toBeVisible();
    expect(reply).toHaveValue('Keep this draft');
    expect(screen.getByRole('radio', { name: 'Question' })).toBeChecked();
    expect(reply.closest('form')).toHaveAttribute('data-dismiss-on-outside-click', 'false');
  });

  it.each([
    { thread: mockThread, heading: `${mockThread.file}:80` },
    {
      thread: {
        id: 'review-thread',
        scope: 'review' as const,
        createdAt: mockThread.createdAt,
        updatedAt: mockThread.updatedAt,
        messages: mockThread.messages,
      },
      heading: 'Review conversation',
    },
  ])(
    'toggles the full $heading heading without invoking card navigation',
    async ({ thread, heading }) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      renderThread({ thread, onClick });

      const disclosure = screen.getByRole('button', { name: 'Collapse thread' });
      const contentId = disclosure.getAttribute('aria-controls')!;
      expect(document.getElementById(contentId)).toContainElement(
        screen.getByText('Reply comment'),
      );
      await user.click(screen.getByText(heading));

      expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(contentId)).not.toBeVisible();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(onClick).not.toHaveBeenCalled();

      await user.click(screen.getByText(heading));
      expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByPlaceholderText('Write a reply...')).toBeVisible();
      expect(onClick).not.toHaveBeenCalled();
    },
  );

  it('supports Enter and Space on the heading without stealing focus', async () => {
    const user = userEvent.setup();
    renderThread();

    const disclosure = screen.getByRole('button', { name: 'Collapse thread' });
    disclosure.focus();
    await user.keyboard('{Enter}');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    expect(disclosure).toHaveFocus();
  });

  it('keeps Copy Prompt independent from disclosure and navigation', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderThread({ onClick });

    await user.click(screen.getByRole('button', { name: 'Copy Prompt' }));

    expect(copyTextToClipboard).toHaveBeenCalledWith('thread prompt');
    expect(screen.getByRole('button', { name: 'Collapse thread' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(onClick).not.toHaveBeenCalled();
  });
});

it('cancels copied feedback when the thread unmounts', async () => {
  vi.useFakeTimers();
  try {
    const view = render(
      <CommentThreadCard
        thread={mockThread}
        onGeneratePrompt={() => 'thread prompt'}
        onToggleThreadResolved={vi.fn()}
        onReplyToThread={vi.fn()}
        onRemoveMessage={vi.fn()}
        onUpdateMessage={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy Prompt' }));
    });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
