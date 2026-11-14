import { describe, expect, it } from 'vitest';
import {
  isPublicMonitorAddress,
  isTechnicalCheckDue,
  parseHttpsMonitorTarget,
  probeHttpsEndpoint,
  resolvePublicAddresses,
  UnsafeMonitorTarget,
} from '../src/lib/monitoring/https-probe';

describe('protección SSRF de sondeos HTTPS (sin tráfico de red)', () => {
  it('solo admite destinos HTTPS públicos y sin secretos ni parámetros', () => {
    expect(parseHttpsMonitorTarget('https://status.example.org/health').hostname).toBe('status.example.org');
    for (const target of [
      'http://status.example.org',
      'https://localhost/',
      'https://127.0.0.1/',
      'https://10.1.2.3/',
      'https://[::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://server.internal/',
      'https://server.local/',
      'https://status.example.org:8443/',
      'https://admin:password@status.example.org/',
      'https://status.example.org/?token=secret',
      'https://status.example.org/#fragment',
      'file:///etc/passwd',
    ]) {
      expect(() => parseHttpsMonitorTarget(target), target).toThrow(UnsafeMonitorTarget);
    }
  });

  it('bloquea prefijos reservados en IPv4 e IPv6 y permite IP públicas', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1',
      '169.254.169.254', '172.16.2.1', '192.0.2.1',
      '192.168.1.1', '198.18.0.1', '198.51.100.1',
      '203.0.113.1', '224.0.0.1', '::1', 'fc00::1',
      'fe80::1', '2001:db8::1', '2002::1',
      '::ffff:192.168.1.1', '64:ff9b::a00:1',
    ]) {
      expect(isPublicMonitorAddress(address), address).toBe(false);
    }
    expect(isPublicMonitorAddress('1.1.1.1')).toBe(true);
    expect(isPublicMonitorAddress('8.8.8.8')).toBe(true);
    expect(isPublicMonitorAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('rechaza un registro privado aunque el DNS también entregue IP públicas', async () => {
    await expect(resolvePublicAddresses('status.example.org', async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])).rejects.toMatchObject({ reason: 'unsafe_address' });

    await expect(probeHttpsEndpoint('https://status.example.org/', 1000, async () => [
      { address: '169.254.169.254', family: 4 },
    ])).rejects.toMatchObject({ reason: 'unsafe_address' });
  });

  it('no convierte DNS sin respuestas o error en una caída confirmada', async () => {
    await expect(resolvePublicAddresses('status.example.org', async () => []))
      .rejects.toMatchObject({ reason: 'unsafe_address' });
    await expect(resolvePublicAddresses('status.example.org', async () => { throw Error('DNS unavailable'); }))
      .rejects.toMatchObject({ reason: 'dns_unavailable' });
    await expect(resolvePublicAddresses('status.example.org', async () => [
      { address: '8.8.8.8', family: 4 },
    ])).resolves.toEqual([{ address: '8.8.8.8', family: 4 }]);
  });
});

describe('ventanas reales de monitoreo y límites', () => {
  const now = new Date('2026-11-14T15:00:00.000Z');
  it('fuerza cinco minutos mínimo aunque la fila solicite menos', () => {
    expect(isTechnicalCheckDue(null, 10, now)).toBe(true);
    expect(isTechnicalCheckDue(new Date('2026-11-14T14:56:00.000Z'), 10, now)).toBe(false);
    expect(isTechnicalCheckDue(new Date('2026-11-14T14:55:00.000Z'), 10, now)).toBe(true);
    expect(isTechnicalCheckDue(new Date('2026-11-14T14:50:00.000Z'), 1800, now)).toBe(false);
    expect(isTechnicalCheckDue(new Date('2026-11-14T14:30:00.000Z'), 1800, now)).toBe(true);
  });
});
