import { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { createOutputWriter } from './dev-output.js';

describe('createOutputWriter', () => {
  it('preserves queued writes until the stream drains', async () => {
    const chunks: string[] = [];
    const callbacks: Array<() => void> = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callbacks.push(callback);
      },
    });
    const write = createOutputWriter(output);
    write('first\n');
    write('last\n');
    expect(chunks).toEqual(['first\n']);
    callbacks.shift()?.();
    expect(chunks).toEqual(['first\n', 'last\n']);
    callbacks.shift()?.();
    await new Promise<void>((resolve) => output.end(resolve));
  });

  it('absorbs asynchronous broken-pipe errors and stops forwarding', async () => {
    const onWrite = vi.fn();
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        onWrite();
        callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }));
      },
    });
    const closed = new Promise<void>((resolve) => output.once('close', resolve));
    const write = createOutputWriter(output);
    write('first\n');
    await closed;
    expect(() => write('discarded\n')).not.toThrow();
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('surfaces invalid chunks without disabling later valid writes', () => {
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const write = createOutputWriter(output);
    expect(() => write(undefined as unknown as string)).toThrow(TypeError);
    write('valid record\n');
    expect(chunks).toEqual(['valid record\n']);
    output.destroy();
  });
});
