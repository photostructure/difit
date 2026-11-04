import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewMenu } from './ViewMenu';

describe('ViewMenu', () => {
  it('holds only the diff display and whitespace controls', () => {
    render(
      <ViewMenu
        mode="split"
        ignoreWhitespace={false}
        onModeChange={vi.fn()}
        onWhitespaceChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    // The theme toggle and the Settings link that View used to hold now live only in Settings.
    const menu = screen.getByRole('dialog');
    expect(
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Split', 'Unified']);
    expect(
      within(menu)
        .getAllByRole('checkbox')
        .map((box) => box.textContent),
    ).toEqual(['Ignore Whitespace']);
  });
});
