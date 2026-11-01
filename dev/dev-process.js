import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

const stopped = new WeakSet();

/** Keep children in the launcher group so terminal hangup and group SIGKILL reach every worker. */
export function getManagedSpawnOptions() {
  return { windowsHide: true };
}

/**
 * Signal each owned worker once. POSIX also walks descendants in the worker's
 * process group. Windows only signals the direct worker: tree utilities cannot
 * distinguish deliberately detached apps, so descendant cleanup is not guaranteed.
 * @param {import('node:child_process').ChildProcess | null} child
 * @param {NodeJS.Signals} signal
 */
export function stopProcessTree(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null || stopped.has(child))
    return;
  stopped.add(child);

  if (platform() === 'win32') {
    child.kill(signal);
    return;
  }

  // Workers stay in the launcher's terminal group. Enumerate only this worker's
  // descendants instead of signalling the shared group during PID-only shutdown.
  try {
    const processes = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
    /** @type {Map<number, number[]>} */
    const children = new Map();
    /** @type {Map<number, number>} */
    const groups = new Map();
    for (const line of processes.trim().split('\n')) {
      const [pid, parent, group] = line.trim().split(/\s+/).map(Number);
      if (!pid || !parent || !group) continue;
      groups.set(pid, group);
      const siblings = children.get(parent) ?? [];
      siblings.push(pid);
      children.set(parent, siblings);
    }
    const workerGroup = groups.get(child.pid);
    const descendants = [child.pid];
    const seen = new Set(descendants);
    for (const parent of descendants) {
      for (const pid of children.get(parent) ?? []) {
        // Detached browsers/editors own their separate process groups. Do not
        // traverse them even while their parent is still one of our workers.
        if (groups.get(pid) !== workerGroup || seen.has(pid)) continue;
        seen.add(pid);
        descendants.push(pid);
      }
    }
    for (const pid of descendants.slice(1).reverse()) {
      try {
        process.kill(pid, signal);
      } catch {
        // A descendant may exit between enumeration and delivery.
      }
    }
  } catch {
    // Still stop the owned worker if process enumeration is unavailable.
  }
  child.kill(signal);
}
