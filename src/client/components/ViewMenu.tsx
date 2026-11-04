import {
  AlignLeft,
  Check,
  ChevronDown,
  Columns,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';

import type { DiffViewMode } from '../../types/diff';

import { Checkbox } from './Checkbox';
import { HeaderMenu } from './HeaderMenu';

export function ViewMenu({
  mode,
  mobile = false,
  onModeChange,
  ignoreWhitespace,
  onWhitespaceChange,
  nextTheme,
  onThemeToggle,
  onSettings,
}: {
  mode: DiffViewMode;
  mobile?: boolean;
  onModeChange: (mode: DiffViewMode) => void;
  ignoreWhitespace: boolean;
  onWhitespaceChange: (checked: boolean) => void;
  nextTheme: 'light' | 'dark';
  onThemeToggle: () => void;
  onSettings: () => void;
}) {
  return (
    <HeaderMenu
      label={
        <>
          <SlidersHorizontal size={14} aria-hidden="true" />
          View
          <ChevronDown size={12} aria-hidden="true" />
        </>
      }
    >
      {!mobile && (
        <div className="mb-3 flex" role="group" aria-label="Diff display">
          {(['split', 'unified'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 border border-github-border px-3 py-2 ${mode === value ? 'bg-github-bg-tertiary font-medium' : ''}`}
            >
              {value === 'split' ? (
                <Columns size={14} aria-hidden="true" />
              ) : (
                <AlignLeft size={14} aria-hidden="true" />
              )}
              {value === 'split' ? 'Split' : 'Unified'}
              <span className="inline-flex w-3.5 shrink-0 justify-center">
                {mode === value && <Check size={14} aria-hidden="true" />}
              </span>
            </button>
          ))}
        </div>
      )}
      <Checkbox
        checked={ignoreWhitespace}
        onChange={onWhitespaceChange}
        label="Ignore Whitespace"
      />
      <button
        type="button"
        onClick={onThemeToggle}
        className="mt-3 flex w-full items-center gap-2 rounded p-2 text-left hover:bg-github-bg-tertiary"
      >
        {nextTheme === 'light' ? <Sun size={14} /> : <Moon size={14} />}Switch to {nextTheme} theme
      </button>
      <button
        type="button"
        data-close-menu
        onClick={onSettings}
        className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-github-bg-tertiary"
      >
        <Settings size={14} />
        Settings
      </button>
    </HeaderMenu>
  );
}
