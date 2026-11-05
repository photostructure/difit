import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApprovalSplitButton } from './ApprovalSplitButton';

describe('approval split button', () => {
  const props = {
    containerRef: null,
    requested: false,
    approved: false,
    pendingCount: 0,
    conditionalSupported: true,
    disabled: false,
    busy: false,
    onApprove: vi.fn(),
    onRevoke: vi.fn(),
  };

  it('anchors the celebration on the whole control, which stays visible at every width', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(<ApprovalSplitButton {...props} containerRef={containerRef} />);

    expect(containerRef.current).toContainElement(
      screen.getByRole('button', { name: 'Approval options' }),
    );
    expect(containerRef.current).toContainElement(
      screen.getByRole('button', { name: 'Approve as-is' }),
    );
  });

  it('titles the options button with what its menu offers, not the as-is action', () => {
    const { rerender } = render(<ApprovalSplitButton {...props} />);
    expect(screen.getByRole('button', { name: 'Approval options' })).toHaveAttribute(
      'title',
      'Choose an approval mode',
    );

    rerender(<ApprovalSplitButton {...props} requested approved mode="as-is" />);
    expect(screen.getByRole('button', { name: 'Approval options' })).toHaveAttribute(
      'title',
      'Approved as-is',
    );
  });

  it('returns both halves to grey after revocation', () => {
    const { rerender } = render(<ApprovalSplitButton {...props} />);
    const group = screen.getByRole('button', { name: 'Approve as-is' }).parentElement;
    expect(group).toHaveClass('bg-github-bg-tertiary');
    rerender(<ApprovalSplitButton {...props} requested approved mode="as-is" />);
    expect(group).toHaveClass('bg-github-accent');
    fireEvent.click(screen.getByRole('button', { name: 'Approval options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke approval' }));
    expect(props.onRevoke).toHaveBeenCalledOnce();
    rerender(<ApprovalSplitButton {...props} />);
    expect(group).toHaveClass('bg-github-bg-tertiary');
    expect(group).not.toHaveClass('bg-github-accent');
  });

  it('keeps the main area an as-is action after approval and opens options only from the arrow', () => {
    const onApprove = vi.fn();
    render(
      <ApprovalSplitButton {...props} requested approved mode="as-is" onApprove={onApprove} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approved as-is' }));
    expect(onApprove).toHaveBeenCalledExactlyOnceWith('as-is');
    expect(screen.queryByRole('button', { name: 'Revoke approval' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approval options' }));
    expect(screen.getByRole('button', { name: 'Revoke approval' })).toBeVisible();
  });

  it('keeps conditional approval visibly pending and blocks it on older servers', () => {
    const { rerender } = render(
      <ApprovalSplitButton {...props} requested mode="after-comments" pendingCount={2} />,
    );
    expect(screen.getByRole('button', { name: 'Approved · 2 pending' }).parentElement).toHaveClass(
      'ui-warning',
    );
    rerender(<ApprovalSplitButton {...props} conditionalSupported={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approval options' }));
    expect(
      screen.getByRole('button', { name: /Approve after comments are addressed/ }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /Approve as-is Land/ })).toBeEnabled();
  });
});
