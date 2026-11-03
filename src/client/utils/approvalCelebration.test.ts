import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApprovalAnimation } from '../components/SettingsModal';
import { celebrateApproval } from './approvalCelebration';

const only = (animation: ApprovalAnimation) => ({
  confetti: animation === 'confetti',
  streamers: animation === 'streamers',
  sparkles: animation === 'sparkles',
});

describe('celebrateApproval', () => {
  let drawCalls: Set<string>;
  let frame: FrameRequestCallback | undefined;
  let source: HTMLButtonElement;

  beforeEach(() => {
    drawCalls = new Set();
    frame = undefined;
    // happy-dom has no 2D context; record which drawing calls each burst makes.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        new Proxy(
          {},
          {
            get: (_, name) => () => drawCalls.add(String(name)),
            set: () => true,
          },
        ) as never,
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    source = document.createElement('button');
    document.body.appendChild(source);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('does nothing when every animation is turned off', () => {
    celebrateApproval(source, { confetti: false, streamers: false, sparkles: false });

    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it.each([
    ['confetti', 'fillRect'],
    ['streamers', 'stroke'],
    ['sparkles', 'closePath'],
  ] as const)('plays only %s when it is the one enabled animation', (animation, signature) => {
    celebrateApproval(source, only(animation));
    expect(document.querySelector('canvas')).not.toBeNull();

    frame?.(performance.now() + 50);

    const signatures = ['fillRect', 'stroke', 'closePath'];
    expect(signatures.filter((call) => drawCalls.has(call))).toEqual([signature]);
  });
});
