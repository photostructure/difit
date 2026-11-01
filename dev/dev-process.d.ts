import type { ChildProcess } from 'node:child_process';

export function getManagedSpawnOptions(): { windowsHide: boolean };
export function stopProcessTree(child: ChildProcess | null, signal: NodeJS.Signals): void;
