import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useFocusedAgentMessage } from './useFocusedAgentMessage';

function Message({ highlighted = false, request = 0 }) {
  const ref = useFocusedAgentMessage('answer', highlighted, request);
  return (
    <>
      <button type="button">Other control</button>
      <div ref={ref} tabIndex={-1}>
        Agent reply
      </div>
    </>
  );
}

describe('agent message navigation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('focuses explicit jump targets and can jump to the same message again', async () => {
    const { rerender } = render(<Message />);
    const reply = screen.getByText('Agent reply');
    const other = screen.getByRole('button', { name: 'Other control' });
    other.focus();
    expect(reply).not.toHaveFocus();
    rerender(<Message highlighted />);
    await waitFor(() => expect(reply).toHaveFocus());
    other.focus();
    rerender(<Message highlighted request={1} />);
    await waitFor(() => expect(reply).toHaveFocus());
  });

  it('does not observe visibility when displaying or navigating to a reply', async () => {
    const observer = vi.fn();
    vi.stubGlobal('IntersectionObserver', observer);
    render(<Message highlighted />);
    await waitFor(() => expect(screen.getByText('Agent reply')).toHaveFocus());
    expect(observer).not.toHaveBeenCalled();
  });
});
