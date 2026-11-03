import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';

import { SettingsModal } from './SettingsModal';

vi.mock('react-hotkeys-hook', () => ({
  useHotkeysContext: vi.fn(() => ({
    enableScope: vi.fn(),
    disableScope: vi.fn(),
  })),
  HotkeysProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HotkeysProvider initiallyActiveScopes={['navigation']}>{children}</HotkeysProvider>
);

const baseSettings = {
  fontSize: 14,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  theme: 'dark' as const,
  syntaxTheme: 'vsDark',
  colorVision: 'normal' as const,
  approvalAnimations: {
    confetti: true,
    streamers: true,
    sparkles: true,
    fireworks: true,
    spirals: true,
    lasers: true,
    disco: true,
  },
  autoViewedPatterns: [],
} satisfies React.ComponentProps<typeof SettingsModal>['settings'];

describe('SettingsModal', () => {
  it('shows appearance settings by default and the editor note in the system section', () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={baseSettings}
        onSettingsChange={vi.fn()}
      />,
      { wrapper },
    );

    expect(screen.getByText('Font Size')).toBeInTheDocument();
    expect(screen.queryByText('Scroll Animation')).not.toBeInTheDocument();
    expect(screen.queryByText('Open In Editor')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Theme, typography, and syntax highlighting.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Appearance')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^Appearance/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /^System/ }));

    const autoViewedPatternsLabel = screen.getByText('Auto-Mark Viewed Patterns');
    const openInEditorLabel = screen.getByText('Open In Editor');
    expect(openInEditorLabel).toBeInTheDocument();
    expect(
      autoViewedPatternsLabel.compareDocumentPosition(openInEditorLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText('Font Size')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^System/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the deuteranopia explanation only while the button is hovered', async () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={baseSettings}
        onSettingsChange={vi.fn()}
      />,
      { wrapper },
    );

    expect(
      screen.queryByText('Deuteranopia mode uses blue/orange instead of green/red for diffs.'),
    ).not.toBeInTheDocument();

    const deuteranopiaButton = screen.getByRole('button', { name: 'Deuteranopia' });
    fireEvent.mouseEnter(deuteranopiaButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(
      'Deuteranopia mode uses blue/orange instead of green/red for diffs.',
    );
    expect(deuteranopiaButton).toHaveAttribute('aria-describedby', tooltip.id);

    fireEvent.mouseLeave(deuteranopiaButton);

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(deuteranopiaButton).not.toHaveAttribute('aria-describedby');
    });
  });

  it('explains that the editor is configured on the server', () => {
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={baseSettings}
        onSettingsChange={vi.fn()}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: /^System/ }));

    expect(screen.getByText(/Set DIFIT_EDITOR before starting difit/)).toBeInTheDocument();
    expect(screen.getByText(/uses EDITOR when it names a preset/)).toBeInTheDocument();
    expect(screen.getByText(/full URL printed by difit/)).toBeInTheDocument();
    expect(
      screen.getByText(/Pass %file or %file:%line as a separate argument/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Command')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Arguments')).not.toBeInTheDocument();
  });

  it('toggles each approval animation and resets them with the appearance defaults', () => {
    const onSettingsChange = vi.fn();
    const settings = {
      ...baseSettings,
      approvalAnimations: { ...baseSettings.approvalAnimations, streamers: false },
    };

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />,
      { wrapper },
    );

    expect(screen.getByRole('checkbox', { name: 'Confetti' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Streamers' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Disco Ball' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      ...settings,
      approvalAnimations: { ...settings.approvalAnimations, disco: false },
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Streamers' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      ...settings,
      approvalAnimations: { ...settings.approvalAnimations, streamers: true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Reset Appearance Defaults' }));
    expect(onSettingsChange).toHaveBeenLastCalledWith(baseSettings);
  });

  it('edits auto-viewed patterns from the system section as newline-delimited values', () => {
    const onSettingsChange = vi.fn();

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        settings={baseSettings}
        onSettingsChange={onSettingsChange}
      />,
      { wrapper },
    );

    fireEvent.click(screen.getByRole('button', { name: /^System/ }));

    const textarea = screen.getByLabelText('Auto-Mark Viewed Patterns');
    fireEvent.change(textarea, { target: { value: '*.test.ts\nsrc/generated/**' } });

    expect(onSettingsChange).toHaveBeenLastCalledWith({
      ...baseSettings,
      autoViewedPatterns: ['*.test.ts', 'src/generated/**'],
    });
  });
});
