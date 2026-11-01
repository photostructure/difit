import type { Writable } from 'node:stream';

export function createOutputWriter(output: Writable): (chunk: string | Uint8Array) => void;
