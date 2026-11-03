import { describe, expect, it } from 'vitest';

import { serverUrl } from './server-url.js';

describe('companion server addresses', () => {
  it.each([
    ['localhost', 'localhost'],
    ['10.1.1.24', '10.1.1.24'],
    ['review.local', 'review.local'],
    ['::1', '[::1]'],
    ['[::1]', '[::1]'],
  ])('addresses host %s', (host, expected) => {
    expect(serverUrl(host, 4966, '/api/conversation/reply')).toBe(
      `http://${expected}:4966/api/conversation/reply`,
    );
  });
  it.each(['', 'http://10.1.1.24', 'user@host', 'host/path', 'host\\path'])(
    'rejects invalid host %s',
    (host) => {
      expect(() => serverUrl(host, 4966, '/api/conversation/reply')).toThrow('hostname or IP');
    },
  );
});
