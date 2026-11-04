import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { saveAutoViewedPatterns } from './autoViewedPatterns';

describe('saveAutoViewedPatterns', () => {
  let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    mockFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    global.fetch = mockFetch as any;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves only the last of rapid edits to the server', async () => {
    saveAutoViewedPatterns(['*.s']);
    saveAutoViewedPatterns(['*.sn']);
    saveAutoViewedPatterns(['*.snap']);

    expect(mockFetch).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/auto-viewed-patterns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patterns: ['*.snap'] }),
    });
  });
});
