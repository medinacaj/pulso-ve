import { afterEach, describe, expect, it } from 'vitest';
import robots from '../src/app/robots';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('robots.txt', () => {
  it('sin indexación: permite rastrear (para que se lea el noindex), excluye la API y no anuncia sitemap', () => {
    delete process.env.PUBLIC_INDEXABLE;
    process.env.SITE_URL = 'https://ejemplo.org';
    const result = robots();
    expect(result.rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/api/'] }]);
    expect(result.sitemap).toBeUndefined();
  });

  it('con indexación: mismas reglas y sitemap absoluto', () => {
    process.env.SITE_URL = 'https://ejemplo.org';
    process.env.PUBLIC_INDEXABLE = 'true';
    const result = robots();
    expect(result.rules).toEqual([{ userAgent: '*', allow: '/', disallow: ['/api/'] }]);
    expect(result.sitemap).toBe('https://ejemplo.org/sitemap.xml');
  });

  it('nunca bloquea el sitio entero ni nombra rutas administrativas', () => {
    for (const indexableValue of ['true', 'false']) {
      process.env.SITE_URL = 'https://ejemplo.org';
      process.env.PUBLIC_INDEXABLE = indexableValue;
      const text = JSON.stringify(robots());
      expect(text).not.toMatch(/"disallow":"\/"|"\/"\]/);
      expect(text).not.toMatch(/admin|centro-control|cuenta/);
    }
  });
});
