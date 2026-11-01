import { ChildProcess } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getManagedSpawnOptions, stopProcessTree } from './dev-process.js';

const mocks = vi.hoisted(() => ({ platform: vi.fn(), execFileSync: vi.fn() }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: mocks.execFileSync,
    default: { ...actual, execFileSync: mocks.execFileSync },
  };
});
vi.mock('node:os', async (original) => {
  const actual = await original<typeof import('node:os')>();
  return { ...actual, platform: mocks.platform, default: { ...actual, platform: mocks.platform } };
});

function ownedChild(pid = 12345): ChildProcess {
  const child = new ChildProcess();
  Object.defineProperty(child, 'pid', { value: pid });
  return child;
}

describe('managed development process trees', () => {
  beforeEach(() => {
    mocks.platform.mockReturnValue('linux');
    mocks.execFileSync.mockReturnValue('');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('keeps workers in the launcher group without requesting a detached session', () => {
    expect(getManagedSpawnOptions()).toEqual({ windowsHide: true });
  });

  it('signals only the owned POSIX worker once', () => {
    const child = ownedChild();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    stopProcessTree(child, 'SIGTERM');
    stopProcessTree(child, 'SIGINT');
    stopProcessTree(null, 'SIGINT');
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
  });

  it('signals only descendants of the owned POSIX worker, deepest first', () => {
    const child = ownedChild();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    const signal = vi.spyOn(process, 'kill').mockReturnValue(true);
    mocks.execFileSync.mockReturnValue('12345 10 50\n101 12345 50\n102 101 50\n103 99999 50\n');
    stopProcessTree(child, 'SIGTERM');
    expect(mocks.execFileSync).toHaveBeenCalledExactlyOnceWith(
      'ps',
      ['-A', '-o', 'pid=,ppid=,pgid='],
      {
        encoding: 'utf8',
      },
    );
    expect(signal.mock.calls).toEqual([
      [102, 'SIGTERM'],
      [101, 'SIGTERM'],
    ]);
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  });

  it('leaves detached browser and editor subtrees outside worker cleanup', () => {
    const child = ownedChild();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    const signal = vi.spyOn(process, 'kill').mockReturnValue(true);
    mocks.execFileSync.mockReturnValue('12345 10 50\n101 12345 50\n201 12345 201\n202 201 201\n');
    stopProcessTree(child, 'SIGTERM');
    expect(signal.mock.calls).toEqual([[101, 'SIGTERM']]);
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  });

  it('still signals the owned worker when process enumeration fails', () => {
    const child = ownedChild();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    mocks.execFileSync.mockImplementation(() => {
      throw new Error('ps unavailable');
    });
    expect(() => stopProcessTree(child, 'SIGTERM')).not.toThrow();
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  });

  it.each(['exit', 'signal'] as const)(
    'does not target an already stopped Windows worker (%s)',
    (reason) => {
      mocks.platform.mockReturnValue('win32');
      const child = ownedChild();
      Object.defineProperty(child, reason === 'exit' ? 'exitCode' : 'signalCode', {
        value: reason === 'exit' ? 0 : 'SIGTERM',
      });
      const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
      stopProcessTree(child, 'SIGINT');
      expect(mocks.execFileSync).not.toHaveBeenCalled();
      expect(kill).not.toHaveBeenCalled();
    },
  );

  it('signals only the Windows worker without following detached apps', () => {
    mocks.platform.mockReturnValue('win32');
    const child = ownedChild();
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    stopProcessTree(child, 'SIGTERM');
    expect(kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
    expect(mocks.execFileSync).not.toHaveBeenCalled();
  });
});
