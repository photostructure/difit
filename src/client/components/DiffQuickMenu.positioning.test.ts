import {
  computePosition,
  type Middleware,
  type Placement,
  type Platform,
} from '@floating-ui/react';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiffQuickMenu } from './DiffQuickMenu';

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: [] as { middleware: Middleware[]; placement: Placement | undefined }[],
}));

vi.mock('@floating-ui/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@floating-ui/react')>();
  return {
    ...original,
    useFloating: (...args: Parameters<typeof original.useFloating>) => {
      const middleware = args[0]?.middleware?.filter((entry): entry is Middleware =>
        Boolean(entry),
      );
      if (middleware) capturedOptions.push({ middleware, placement: args[0]?.placement });
      return original.useFloating(...args);
    },
  };
});

describe('DiffQuickMenu viewport positioning', () => {
  beforeEach(() => capturedOptions.splice(0));

  it.each([
    [0, 320],
    [1, 360],
  ] as const)('keeps panel %i inside the clipping width', async (index, designWidth) => {
    render(
      createElement(DiffQuickMenu, {
        options: { specialOptions: [], branches: [], commits: [], originDefaultBranch: 'main' },
        selection: { baseCommitish: 'HEAD', targetCommitish: '.' },
        onSelectDiff: vi.fn(),
        onOpenAdvanced: vi.fn(),
      }),
    );
    const floating = document.createElement('div');
    const reference = document.createElement('button');
    const currentWidth = () =>
      Math.min(designWidth, Number.parseFloat(floating.style.maxWidth) || designWidth);
    // A 320px outer viewport with a 15px scrollbar has 305px of clipping width.
    const platform: Platform = {
      getElementRects: async () => ({
        reference: { x: 8, y: 200, width: 250, height: 30 },
        floating: { x: 0, y: 0, width: currentWidth(), height: 180 },
      }),
      getClientRects: () => [],
      getScale: () => ({ x: 1, y: 1 }),
      getClippingRect: async () => ({ x: 0, y: 0, width: 305, height: 900 }),
      getDimensions: async () => ({ width: currentWidth(), height: 180 }),
      isElement: () => false,
      getDocumentElement: () => document.documentElement,
      getOffsetParent: async () => window,
      convertOffsetParentRelativeRectToViewportRelativeRect: async ({ rect }) => rect,
      isRTL: async () => false,
    };
    const result = await computePosition(reference, floating, {
      ...capturedOptions[index],
      platform,
    });
    expect(currentWidth()).toBe(289);
    expect(result.x).toBeGreaterThanOrEqual(8);
    expect(result.x + currentWidth()).toBeLessThanOrEqual(297);
  });
});
