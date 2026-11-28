import { describe, it, expect } from 'vitest';
import { geoHintProvider, suggestStateCode } from '../src/lib/geo';
import { statesSeed } from '../src/lib/db/seed-data/states';

const VALID = new Set(statesSeed.map((s) => s.code));
const h = (o: Record<string, string>) => new Headers(o);

describe('geo: estado sugerido por cabeceras del hosting', () => {
  it('desactivado por defecto: sin GEO_HINT_HEADERS no hay sugerencia aunque lleguen cabeceras', () => {
    expect(geoHintProvider(undefined)).toBeNull();
    expect(geoHintProvider('')).toBeNull();
    expect(geoHintProvider('nginx')).toBeNull();
    expect(suggestStateCode(h({ 'cf-ipcountry': 'VE', 'cf-region-code': 'A' }), VALID, null)).toBeNull();
  });

  it('acepta el proveedor sin distinguir mayúsculas', () => {
    expect(geoHintProvider(' Cloudflare ')).toBe('cloudflare');
    expect(geoHintProvider('VERCEL')).toBe('vercel');
  });

  it('Cloudflare y Vercel, con o sin prefijo VE-', () => {
    expect(suggestStateCode(h({ 'cf-ipcountry': 've', 'cf-region-code': 'VE-M' }), VALID, 'cloudflare')).toBe('VE-M');
    expect(suggestStateCode(h({ 'x-vercel-ip-country': 'VE', 'x-vercel-ip-country-region': 'a' }), VALID, 'vercel')).toBe('VE-A');
  });

  it('solo lee las cabeceras del proveedor configurado', () => {
    expect(suggestStateCode(h({ 'x-vercel-ip-country': 'VE', 'x-vercel-ip-country-region': 'A' }), VALID, 'cloudflare')).toBeNull();
    expect(suggestStateCode(h({ 'cf-ipcountry': 'VE', 'cf-region-code': 'A' }), VALID, 'vercel')).toBeNull();
  });

  it('otro país, sin región, región desconocida o con formato inválido → sin sugerencia', () => {
    const cf = (o: Record<string, string>) => suggestStateCode(h(o), VALID, 'cloudflare');
    expect(cf({ 'cf-ipcountry': 'CO', 'cf-region-code': 'A' })).toBeNull();
    expect(cf({ 'cf-ipcountry': 'VE' })).toBeNull();
    expect(cf({ 'cf-ipcountry': 'VE', 'cf-region-code': 'Q' })).toBeNull(); // no es un estado sembrado
    expect(cf({ 'cf-ipcountry': 'VE', 'cf-region-code': 'DC' })).toBeNull();
    expect(cf({ 'cf-ipcountry': 'VE', 'cf-region-code': 'VE-<script>' })).toBeNull();
  });
});
