import { fireEvent, render, screen } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';

import { AgentUpdatesPanel } from './AgentUpdatesPanel';

describe('agent updates panel', () => {
  it('keeps keyboard focus in the panel and closes with Escape', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <HotkeysProvider initiallyActiveScopes={['navigation']}>
        <button type="button">Outside</button>
        <AgentUpdatesPanel updates={[]} onClose={onClose} onSelect={vi.fn()} />
      </HotkeysProvider>,
    );
    const panel = screen.getByRole('dialog', { name: 'Unseen agent updates' });
    const close = screen.getByRole('button', { name: 'Close updates' });
    expect(document.activeElement).toBe(panel);
    fireEvent.keyDown(panel, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
  });
});
