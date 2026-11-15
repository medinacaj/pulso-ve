import { describe, expect, it } from 'vitest';
import { readAccountActionFragment } from '../src/lib/auth/account-fragment';

describe('enlaces privados sin tokens en el HTTP request', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature123';
  it('extrae una única credencial desde el fragmento, no la URL del servidor', () => {
    expect(readAccountActionFragment('#token=' + token)).toBe(token);
    const link = new URL('https://staging.example.org/cuenta/verificar#token=' + token);
    expect(link.search).toBe('');
    expect(link.hash).toContain(token);
    expect(link.origin + link.pathname).not.toContain(token);
  });
  it('rechaza tokens ambiguos, truncados o parámetros inesperados', () => {
    expect(readAccountActionFragment('')).toBe('');
    expect(readAccountActionFragment('?token=' + token)).toBe('');
    expect(readAccountActionFragment('#token=abc')).toBe('');
    expect(readAccountActionFragment('#token=' + token + '&token=' + token)).toBe('');
    expect(readAccountActionFragment('#token=' + token + '&redirect=https://evil.example')).toBe('');
    expect(readAccountActionFragment('#access_token=' + token)).toBe('');
  });
});
