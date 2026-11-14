import { lookup as lookupDns } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

export type TechnicalProbe = {
  success: boolean;
  latencyMs: number | null;
  statusCode: number | null;
  errorCode: 'http_error' | 'timeout' | 'tls_error' | 'network_error' | 'dns_error' | null;
};

export type ResolvedAddress = { address: string; family: number };
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export class UnsafeMonitorTarget extends Error {
  constructor(public readonly reason: 'invalid_target' | 'unsafe_address' | 'dns_unavailable') {
    super(reason);
    this.name = 'UnsafeMonitorTarget';
  }
}

const blockedIpv4 = new BlockList();
const blockedIpv6 = new BlockList();
const blockedV4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const blockedV6: Array<[string, number]> = [
  ['::', 3], ['4000::', 2], ['8000::', 1], // only global-unicast 2000::/3
  ['2001::', 32], ['2001:db8::', 32], ['2001:10::', 28],
  ['2001:20::', 28], ['2002::', 16], // Teredo, documentation, ORCHID, 6to4
];
for (const [ip, prefix] of blockedV4) blockedIpv4.addSubnet(ip, prefix, 'ipv4');
for (const [ip, prefix] of blockedV6) blockedIpv6.addSubnet(ip, prefix, 'ipv6');

export function isPublicMonitorAddress(address: string): boolean {
  const family = isIP(address);
  if (!family) return false;
  // IPv4-mapped IPv6 must not bypass IPv4 filtering.
  if (family === 6 && /^::ffff:/i.test(address)) return false;
  return family === 4
    ? !blockedIpv4.check(address, 'ipv4')
    : !blockedIpv6.check(address, 'ipv6');
}

/** Strictly HTTPS:443 and manually configured public DNS hostnames.
 * Never follow redirects or accept credentials/query parameters.
 */
export function parseHttpsMonitorTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeMonitorTarget('invalid_target');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    (url.port !== '' && url.port !== '443') ||
    !host.includes('.') ||
    host.includes(':') ||
    isIP(host) !== 0 ||
    host === 'localhost' ||
    /\.(localhost|local|internal|test|invalid|example|onion|home\.arpa)$/.test(host) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new UnsafeMonitorTarget('invalid_target');
  }
  return url;
}

export async function resolvePublicAddresses(
  hostname: string,
  resolver: HostResolver = async (host) => lookupDns(host, { all: true, verbatim: true }),
): Promise<ResolvedAddress[]> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new UnsafeMonitorTarget('dns_unavailable');
  }
  if (
    !addresses.length ||
    addresses.some(({ address, family }) => isIP(address) !== family || !isPublicMonitorAddress(address))
  ) {
    throw new UnsafeMonitorTarget('unsafe_address');
  }
  return addresses;
}

function errorCategory(error: NodeJS.ErrnoException): TechnicalProbe['errorCode'] {
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') return 'timeout';
  if (error.code?.startsWith('ERR_TLS') || error.code?.startsWith('CERT_') ||
      error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    return 'tls_error';
  }
  return 'network_error';
}

/** Only checks whether a configured host responds over verified HTTPS.
 * The result is evidence about an endpoint, NOT proof a whole provider is online.
 */
export async function probeHttpsEndpoint(
  rawTarget: string,
  requestedTimeoutMs: number,
  resolver?: HostResolver,
): Promise<TechnicalProbe> {
  const url = parseHttpsMonitorTarget(rawTarget);
  const addresses = await resolvePublicAddresses(url.hostname, resolver);
  // All DNS results were examined. Pin connection to the chosen public IP,
  // so a second DNS resolution cannot redirect the socket to a private address.
  const selected = addresses[0];
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(1000, Math.min(Math.trunc(requestedTimeoutMs), 10_000))
    : 5000;
  const startedAt = Date.now();

  return new Promise<TechnicalProbe>((resolve) => {
    let finished = false;
    const finish = (result: TechnicalProbe) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: url.hostname,
        servername: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'HEAD',
        agent: false,
        rejectUnauthorized: true,
        headers: { 'user-agent': 'PulsoVE-Monitor/1.0', accept: '*/*' },
        lookup(_hostname, _options, callback) {
          (callback as (error: NodeJS.ErrnoException | null, address: string, family: number) => void)(
            null, selected.address, selected.family,
          );
        },
      },
      (response) => {
        const code = response.statusCode ?? null;
        // Do not follow Location to another origin and do not download content.
        response.destroy();
        const reachable = code !== null && code >= 200 && code < 400;
        finish({
          success: reachable,
          latencyMs: Math.max(0, Date.now() - startedAt),
          statusCode: code,
          errorCode: reachable ? null : 'http_error',
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        success: false,
        latencyMs: Math.max(0, Date.now() - startedAt),
        statusCode: null,
        errorCode: errorCategory(error),
      });
    });
    req.setTimeout(timeoutMs, () => {
      const error = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      req.destroy(error);
    });
    req.end();
  });
}

/** Frequency floor ensures no configured endpoint can be sampled more often
 * than every 5 minutes even if a database row is misconfigured.
 */
export function isTechnicalCheckDue(lastCheckedAt: Date | null, frequencySeconds: number, now: Date): boolean {
  const seconds = Number.isFinite(frequencySeconds) ? Math.max(300, Math.trunc(frequencySeconds)) : 300;
  return !lastCheckedAt || now.getTime() - lastCheckedAt.getTime() >= seconds * 1000;
}
