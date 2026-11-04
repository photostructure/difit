import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { StaticDiffDataset } from '../types/staticDiff';

import { installStaticApiBridge, type StaticApiBridge } from './staticApiBridge';

const dataset: StaticDiffDataset = {
  repository: 'example/repo',
  initialRevisionId: 'r1',
  revisions: [
    {
      id: 'r1',
      baseHash: 'aaaa',
      baseShortHash: 'aaaa',
      targetHash: 'bbbb',
      targetShortHash: 'bbbb',
      message: 'example',
      authorName: 'Example',
      date: '2026-11-04',
    },
  ],
  diffs: { r1: { commit: 'aaaa...bbbb', files: [] } },
  blobs: {},
};

describe('installStaticApiBridge', () => {
  let bridge: StaticApiBridge;

  beforeEach(() => {
    localStorage.clear();
    bridge = installStaticApiBridge(dataset);
  });

  afterEach(() => {
    bridge.restore();
  });

  it('keeps auto-viewed patterns in this browser, since the demo site has no server', async () => {
    const put = await fetch('/api/auto-viewed-patterns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patterns: ['*.md'] }),
    });
    expect(put.ok).toBe(true);

    bridge.restore();
    bridge = installStaticApiBridge(dataset);

    const diff = (await (await fetch('/api/diff')).json()) as { autoViewedPatterns?: string[] };
    expect(diff.autoViewedPatterns).toEqual(['*.md']);
  });

  it('keeps patterns the demo saved before they had their own storage key', async () => {
    localStorage.setItem(
      'reviewit-appearance-settings',
      JSON.stringify({ theme: 'dark', autoViewedPatterns: ['*.lock'] }),
    );

    const diff = (await (await fetch('/api/diff')).json()) as { autoViewedPatterns?: string[] };
    expect(diff.autoViewedPatterns).toEqual(['*.lock']);
  });
});
