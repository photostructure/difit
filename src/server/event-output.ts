import type { Writable } from 'node:stream';

import type { ServerEvent } from '../types/events.js';

const connected = new WeakSet<Writable>();
const failed = new WeakSet<Writable>();

/** A closed consumer must not take down the review UI or acknowledge delivery. */
export function writeJsonl(event: ServerEvent, output: Writable = process.stdout): void {
  if (!connected.has(output)) {
    connected.add(output);
    output.on('error', () => failed.add(output));
  }
  if (failed.has(output)) return;
  // Serialization failures are internal errors, not evidence that the consumer closed.
  const record = `${JSON.stringify(event)}\n`;
  output.write(record, (error) => {
    if (error) failed.add(output);
  });
}
