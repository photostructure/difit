import { Writable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import type { ServerShutdownEvent } from '../types/events.js';
import { writeJsonl } from './event-output.js';

const event: ServerShutdownEvent = {
  type: 'server.shutdown',
  reason: 'closed',
  pid: 42,
  timestamp: '2026-10-29T00:00:00Z',
};

describe('JSONL event output', () => {
  it('writes exactly one complete JSON record and newline per event', () => {
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    });
    writeJsonl(event, output);
    writeJsonl(event, output);
    expect(chunks).toEqual([`${JSON.stringify(event)}\n`, `${JSON.stringify(event)}\n`]);
    expect(output.listenerCount('error')).toBe(1);
  });

  it('absorbs EPIPE and stops writing when the consumer disconnects', async () => {
    const write = vi.fn(
      (_chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void) => {
        done(Object.assign(new Error('consumer closed'), { code: 'EPIPE' }));
      },
    );
    const output = new Writable({ write });
    const closed = new Promise<void>((resolve) => output.once('close', resolve));
    writeJsonl(event, output);
    await closed;
    expect(() => writeJsonl(event, output)).not.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('absorbs writes after a real Writable has ended', async () => {
    const output = new Writable({
      autoDestroy: false,
      write(_chunk, _encoding, done) {
        done();
      },
    });
    const finished = new Promise<void>((resolve) => output.once('finish', resolve));
    output.end();
    await finished;
    const write = vi.spyOn(output, 'write');
    const failedWrite = new Promise<Error>((resolve) => output.once('error', resolve));
    expect(() => writeJsonl(event, output)).not.toThrow();
    await expect(failedWrite).resolves.toMatchObject({ code: 'ERR_STREAM_WRITE_AFTER_END' });
    expect(() => writeJsonl(event, output)).not.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    output.destroy();
  });

  it('surfaces serialization errors without disabling subsequent valid records', () => {
    const chunks: string[] = [];
    const output = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk.toString());
        done();
      },
    });
    const malformed = { ...event, unexpected: 1n };
    // Ground truth: node -e "try { JSON.stringify({unexpected: 1n}); } catch (e) { console.log(e.name); }" prints TypeError.
    expect(() => writeJsonl(malformed, output)).toThrow(TypeError);
    writeJsonl(event, output);
    expect(chunks).toEqual([`${JSON.stringify(event)}\n`]);
  });
});
