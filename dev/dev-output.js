/**
 * Keep managing children after an output consumer disconnects. Successful writes
 * remain queued on the stream; callers must use process.exitCode rather than
 * process.exit() so Node can drain them before exiting.
 * @param {import('node:stream').Writable} output
 * @returns {(chunk: string | Uint8Array) => void}
 */
export function createOutputWriter(output) {
  let failed = false;
  output.on('error', () => {
    failed = true;
  });

  return (chunk) => {
    if (failed || output.destroyed) return;
    output.write(chunk, (error) => {
      if (error) failed = true;
    });
  };
}
