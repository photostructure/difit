import { InvalidArgumentError } from 'commander';

export function parseServerPort(value: string): number {
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new InvalidArgumentError('Expected an integer from 1 to 65535');
  return port;
}

/** Companion commands must address the interface the server actually listens on. */
export function serverUrl(host: string, port: number, path: string): string {
  parseServerPort(String(port));
  if (!host || /[\s/\\@?#]/.test(host))
    throw new Error('Expected a server hostname or IP address for --host');
  const hostname = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  try {
    return new URL(path, `http://${hostname}:${port}`).href;
  } catch {
    throw new Error('Expected a server hostname or IP address for --host');
  }
}
