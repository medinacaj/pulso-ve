/** Read JSON with a strict byte cap, even without a Content-Length header.
 * Avoid request.text()/json() buffering arbitrarily large public POST bodies.
 */
export class RequestBodyTooLargeError extends Error {
  constructor() { super('El cuerpo supera el tamaño permitido'); }
}

export async function readLimitedJson(request: Request, maxBytes: number): Promise<unknown> {
  const advertised = request.headers.get('content-length');
  if (advertised !== null && Number(advertised) > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('JSON body required');
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (bytes + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyTooLargeError();
      }
      bytes += value.byteLength;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
