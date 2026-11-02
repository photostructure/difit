import { Readable } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readStdin } from './utils';

function stdinChunks(chunks: Buffer[]): void {
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(Readable.from(chunks) as typeof process.stdin);
}

afterEach(() => vi.restoreAllMocks());

describe('named review stdin decoding', () => {
  it.each([Buffer.from([0x63, 0x61, 0x66, 0xe9]), Buffer.from([0xe2, 0x82])])(
    'rejects malformed UTF-8 bytes without substituting characters: %j',
    async (bytes) => {
      // Ground truth: TextDecoder utf-8 fatal mode rejects Latin-1 and incomplete UTF-8.
      stdinChunks([bytes]);
      await expect(readStdin({ strictUtf8: true })).rejects.toThrow('valid UTF-8');
    },
  );

  it('preserves BOM, CRLF, literal replacement characters and split multibyte bytes', async () => {
    const text = '\ufeffcafé 😺 �\r\n';
    const bytes = Buffer.from(text);
    stdinChunks([
      bytes.subarray(0, 2),
      bytes.subarray(2, 7),
      bytes.subarray(7, 11),
      bytes.subarray(11),
    ]);
    const decoded = await readStdin({ strictUtf8: true });
    expect(decoded).toBe(text);
    expect(Buffer.from(decoded)).toEqual(bytes);
  });

  it('preserves the ordinary reader legacy decoding when strict mode is omitted', async () => {
    const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    stdinChunks([bytes]);
    expect(await readStdin()).toBe(bytes.toString('utf8'));
  });
});
