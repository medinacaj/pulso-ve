/**
 * Read-only preflight for a manually installed Namecheap/cPanel standalone app.
 * Does not migrate, seed, alter DNS, send mail or check external services.
 * Prints no secrets or internal database hostnames.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateNamecheapConfiguration(env = process.env, nodeVersion = process.versions.node) {
  const failures = [];
  const warnings = [];

  const major = Number.parseInt(String(nodeVersion).split('.')[0] ?? '0', 10);
  if (!Number.isInteger(major) || major < 22) failures.push('Node.js 22+ requerido');
  if (env.NODE_ENV !== 'production') failures.push('NODE_ENV debe ser production');

  let site;
  try {
    site = new URL(env.SITE_URL ?? '');
    if (site.protocol !== 'https:' || site.username || site.password ||
        site.pathname !== '/' || site.search || site.hash) throw Error();
  } catch {
    failures.push('SITE_URL debe ser un origen HTTPS sin ruta');
  }

  const databaseUrl = env.DATABASE_URL ?? '';
  let databaseValid = false;
  try {
    const parsed = new URL(databaseUrl);
    databaseValid = ['postgresql:', 'postgres:'].includes(parsed.protocol) &&
      Boolean(parsed.hostname) && Boolean(parsed.username) && Boolean(parsed.pathname.slice(1));
  } catch {
    databaseValid = false;
  }
  if (!databaseValid) failures.push('DATABASE_URL PostgreSQL no configurada');
  if (/pulsove_dev_pw|ci:ci@|pulsove_ci|pulsove_package/i.test(databaseUrl)) {
    failures.push('DATABASE_URL contiene credenciales de ejemplo o CI');
  }

  const salt = env.ANONYMIZATION_SALT ?? '';
  if (salt.length < 32 || salt.toLowerCase().includes('reemplazar')) {
    failures.push('ANONYMIZATION_SALT no es apta para tráfico real');
  }

  if (env.ADMIN_ACCESS_ENABLED === 'true') {
    const secret = env.JWT_SECRET ?? '';
    if (secret.length < 40 || secret.toLowerCase().includes('reemplazar')) {
      failures.push('JWT_SECRET administrativa insuficiente');
    }
    if (!/^[A-Z2-7]{32,}$/i.test(env.ADMIN_TOTP_SECRET_BASE32 ?? '')) {
      failures.push('ADMIN_TOTP_SECRET_BASE32 no configurada');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_OWNER_EMAIL ?? '')) {
      failures.push('ADMIN_OWNER_EMAIL no configurado');
    }
  } else {
    warnings.push('Centro de Control deshabilitado; no hay acceso administrativo todavía');
  }

  if (env.ENABLE_TECHNICAL_CHECKS !== 'true') {
    warnings.push('Colector técnico deshabilitado; no hay sondeos automáticos');
  } else {
    warnings.push('Colector marcado activo: verificar frecuencia, fuentes autorizadas y frescura por separado');
  }
  if (env.PUBLIC_INDEXABLE === 'true') {
    warnings.push('Indexación activada: exige aprobación SEO y pruebas de seguridad antes de abrir tráfico');
  }
  if (env.TRUSTED_CLIENT_IP_HEADER) {
    warnings.push('Validar que el proxy sobrescribe la cabecera IP configurada');
  }
  if (!env.REDIS_URL) {
    warnings.push('Rate limiting en memoria: válido solo en instancia única');
  }

  return { failures, warnings };
}

export async function runNamecheapPreflight() {
  const result = validateNamecheapConfiguration();
  const database = { connected: false, compatible: false, schemaPresent: false };

  if (result.failures.length === 0) {
    let client;
    try {
      const { default: postgres } = await import('postgres');
      client = postgres(process.env.DATABASE_URL, {
        max: 1,
        connect_timeout: 5,
        idle_timeout: 5,
      });

      const [info] = await client`
        select current_setting('server_version_num')::int as version,
          to_regclass('public.services') is not null as services,
          to_regclass('public.technical_checks') is not null as technical_checks
      `;
      database.connected = true;
      database.compatible = Number(info.version) >= 160000;
      database.schemaPresent = Boolean(info.services && info.technical_checks);
      if (!database.compatible) result.failures.push('PostgreSQL 16+ no disponible');
      if (!database.schemaPresent) result.failures.push('Migraciones requeridas; esquema incompleto');
    } catch {
      result.failures.push('No es posible verificar PostgreSQL con la conexión configurada');
    } finally {
      if (client) await client.end({ timeout: 2 }).catch(() => {});
    }
  }

  const ok = result.failures.length === 0;
  console.log(JSON.stringify({
    status: ok ? 'configuration_checks_passed' : 'blocked',
    checks: {
      node: process.versions.node,
      database,
      failures: result.failures,
      warnings: result.warnings,
    },
    note: 'No verifica DNS, TLS público, cron, correo, MFA de usuario, alertas, restauración o aptitud de producción',
  }, null, 2));
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNamecheapPreflight().then(
    (passed) => { if (!passed) process.exitCode = 1; },
    () => {
      console.error('Preflight no concluyó. Revisar configuración privada.');
      process.exitCode = 1;
    },
  );
}
