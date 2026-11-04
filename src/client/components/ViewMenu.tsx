import { AlignLeft, ChevronDown, Columns, SlidersHorizontal } from 'lucide-react';

import type { DiffViewMode } from '../../types/diff';

import { Checkbox } from './Checkbox';
import { HeaderMenu } from './HeaderMenu';

export function ViewMenu({
  mode,
  mobile = false,
  onModeChange,
  ignoreWhitespace,
  onWhitespaceChange,
}: {
  mode: DiffViewMode;
  mobile?: boolean;
  onModeChange: (mode: DiffViewMode) => void;
  ignoreWhitespace: boolean;
  onWhitespaceChange: (checked: boolean) => void;
}) {
  return (
    <HeaderMenu
      title="View"
      label={
        <>
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span className="sr-only lg:not-sr-only">View</span>
          <ChevronDown size={12} aria-hidden="true" />
        </>
      }
    >
      {!mobile && (
        <div className="mb-3 flex gap-2" role="group" aria-label="Diff display">
          {(['split', 'unified'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => onModeChange(value)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm transition-colors ${
                mode === value
                  ? 'bg-github-accent text-white border-github-accent'
                  : 'bg-github-bg-tertiary text-github-text-secondary border-github-border hover:text-github-text-primary'
              }`}
            >
              {value === 'split' ? (
                <Columns size={14} aria-hidden="true" />
              ) : (
                <AlignLeft size={14} aria-hidden="true" />
              )}
              {value === 'split' ? 'Split' : 'Unified'}
            </button>
          ))}
        </div>
      )}
      <Checkbox
        checked={ignoreWhitespace}
        onChange={onWhitespaceChange}
        label="Ignore Whitespace"
      />
    </HeaderMenu>
  );
}
