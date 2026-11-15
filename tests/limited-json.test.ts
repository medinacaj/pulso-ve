import { describe, expect, it } from 'vitest';
import { readLimitedJson, RequestBodyTooLargeError } from '@/lib/api/limited-json';

const request = (body: string, headers?: Record<string, string>) =>
  new Request('http://localhost/api/reports', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('bounded JSON reading for public write endpoints', () => {
  it('accepts a small valid payload without relying on Content-Length', async () => {
    await expect(readLimitedJson(request('{"deviceSeed":"demo-id"}'), 64))
      .resolves.toEqual({ deviceSeed: 'demo-id' });
  });

  it('rejects a large body based on actual bytes, even without a length header', async () => {
    await expect(readLimitedJson(request(JSON.stringify({ body: 'x'.repeat(5000) })), 2400))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('rejects an advertised size exceeding the limit before parsing', async () => {
    await expect(readLimitedJson(request('{}', { 'Content-Length': '8000' }), 4096))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('counts UTF-8 bytes rather than UTF-16 characters', async () => {
    const input = JSON.stringify({ comment: 'á'.repeat(8) });
    expect(input.length).toBeLessThan(30);
    await expect(readLimitedJson(request(input), 20))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('rejects invalid or empty JSON without exposing internals', async () => {
    await expect(readLimitedJson(request('{bad'), 64)).rejects.toBeInstanceOf(SyntaxError);
    await expect(readLimitedJson(request(''), 64)).rejects.toBeInstanceOf(SyntaxError);
  });
});
