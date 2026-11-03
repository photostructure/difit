import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewPresence } from './review-presence.js';

describe('review presence', () => {
  afterEach(() => vi.useRealTimers());

  it('counts distinct tabs and keeps a tab connected through overlapping reconnects', () => {
    const presence = new ReviewPresence();
    const first = presence.connectReviewer('tab', true);
    const reconnect = presence.connectReviewer('tab', false);
    expect(presence.snapshot().reviewers).toEqual({ connected: 1, visible: 1 });
    first();
    expect(presence.snapshot().reviewers).toEqual({ connected: 1, visible: 0 });
    reconnect();
    expect(presence.snapshot().reviewers.connected).toBe(0);
  });

  it('updates visibility without disconnecting the browser', () => {
    const presence = new ReviewPresence();
    presence.connectReviewer('ipad', true);
    presence.updateReviewer('ipad', false);
    expect(presence.snapshot().reviewers).toEqual({ connected: 1, visible: 0 });
    presence.updateReviewer('ipad', true);
    expect(presence.snapshot().reviewers.visible).toBe(1);
  });

  it('keeps listeners attached across HTTP renewal and expires them after disconnect', async () => {
    vi.useFakeTimers();
    const presence = new ReviewPresence();
    const detach = presence.connectListener('agent');
    detach();
    await vi.advanceTimersByTimeAsync(500);
    const next = presence.connectListener('agent');
    await vi.advanceTimersByTimeAsync(1000);
    expect(presence.snapshot().listeners).toBe(1);
    next();
    next();
    await vi.advanceTimersByTimeAsync(1000);
    expect(presence.snapshot().listeners).toBe(0);
  });

  it('cleans up listener timers and observers when the server closes', () => {
    vi.useFakeTimers();
    const presence = new ReviewPresence();
    const observer = vi.fn();
    presence.subscribe(observer);
    const detach = presence.connectListener('agent');
    detach();
    presence.dispose();
    detach();
    expect(vi.getTimerCount()).toBe(0);
    expect(presence.snapshot().listeners).toBe(0);
  });
});
