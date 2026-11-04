import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ReviewContext as ReviewContextData } from '../../types/diff';
import { ReviewContext } from './ReviewContext';

const context: ReviewContextData = {
  source: 'git',
  repositoryName: 'difit',
  repositoryPath: '/projects/worktrees/conversation-view/difit',
  workingDirectory: '/projects/worktrees/conversation-view/difit/src',
  hostname: 'review-host',
};

describe('ReviewContext', () => {
  it('identifies the review and exposes selectable details on demand', () => {
    const { container } = render(<ReviewContext context={context} />);
    expect(screen.getByRole('region', { name: 'Review context' })).toBeVisible();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByText('Repository')).toBeVisible();
    expect(screen.getByText('review-host')).toBeVisible();
    expect(screen.getByText(context.workingDirectory)).toBeVisible();
  });

  it('labels imported diffs without claiming the launch directory is their repository', () => {
    render(
      <ReviewContext
        context={{ source: 'stdin', workingDirectory: '/launcher', hostname: 'host' }}
      />,
    );
    expect(screen.getByText('Imported diff')).toBeVisible();
    expect(screen.queryByText('Repository')).not.toBeInTheDocument();
    expect(screen.getByText('Launched from')).toBeInTheDocument();
  });

  it('keeps the tab title unchanged while metadata is opened and closed', () => {
    const previousTitle = document.title;
    const { unmount } = render(<ReviewContext context={context} />);
    expect(document.title).toBe(previousTitle);
    unmount();
    expect(document.title).toBe(previousTitle);
  });

  it('renders nothing for older servers without context', () => {
    const { container } = render(<ReviewContext />);
    expect(container).toBeEmptyDOMElement();
  });
});
