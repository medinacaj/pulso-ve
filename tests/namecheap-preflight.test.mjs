import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNamecheapConfiguration } from '../scripts/preflight-namecheap.mjs';

const base = {
  NODE_ENV: 'production',
  SITE_URL: 'https://staging.example.org',
  DATABASE_URL: 'postgresql://staging_user:random@db.example.org:5432/pulsove_staging',
  ANONYMIZATION_SALT: 'LOCAL_NON_SENSITIVE_SAMPLE_HASH_SALT_12345',
  PUBLIC_INDEXABLE: 'false',
  ENABLE_TECHNICAL_CHECKS: 'false',
  ADMIN_ACCESS_ENABLED: 'false',
};

test('configuración de staging: diagnóstico sin afirmar monitoreo real', () => {
  const result = validateNamecheapConfiguration(base, '22.16.0');
  assert.deepEqual(result.failures, []);
  assert.ok(result.warnings.some((item) => item.includes('Colector técnico deshabilitado')));
  assert.ok(result.warnings.some((item) => item.includes('Centro de Control deshabilitado')));
});

test('rechaza Node antiguo, HTTP, secretos de ejemplo y PostgreSQL de CI', () => {
  const env = {
    ...base,
    NODE_ENV: 'development',
    SITE_URL: 'http://staging.example.org/',
    DATABASE_URL: 'postgresql://ci:ci@localhost:5432/pulsove_ci',
    ANONYMIZATION_SALT: 'reemplazar-con-otro-secreto-aleatorio',
  };
  const result = validateNamecheapConfiguration(env, '20.11.0');
  assert.ok(result.failures.some((line) => line.includes('Node.js 22+')));
  assert.ok(result.failures.some((line) => line.includes('NODE_ENV')));
  assert.ok(result.failures.some((line) => line.includes('SITE_URL')));
  assert.ok(result.failures.some((line) => line.includes('CI')));
  assert.ok(result.failures.some((line) => line.includes('ANONYMIZATION_SALT')));
  assert.equal(JSON.stringify(result).includes('postgresql://'), false);
  assert.equal(JSON.stringify(result).includes('reemplazar-con-otro'), false);
});

test('autenticación habilitada exige JWT, clave TOTP y único administrador', () => {
  const result = validateNamecheapConfiguration({ ...base, ADMIN_ACCESS_ENABLED: 'true' }, '22.16.0');
  assert.ok(result.failures.some((line) => line.includes('JWT_SECRET')));
  assert.ok(result.failures.some((line) => line.includes('TOTP')));
  assert.ok(result.failures.some((line) => line.includes('ADMIN_OWNER_EMAIL')));
  const valid = validateNamecheapConfiguration({
    ...base,
    ADMIN_ACCESS_ENABLED: 'true',
    JWT_SECRET: 'THIS_IS_A_FAKE_TEST_SECRET_ONLY_WITH_SUFFICIENT_LENGTH',
    ADMIN_TOTP_SECRET_BASE32: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    ADMIN_OWNER_EMAIL: 'owner@example.org',
  }, '22.16.0');
  assert.deepEqual(valid.failures, []);
});

test('la indexación pública y la cabecera de proxy generan advertencias', () => {
  const result = validateNamecheapConfiguration({
    ...base,
    PUBLIC_INDEXABLE: 'true',
    TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for',
  }, '23.0.0');
  assert.ok(result.warnings.some((line) => line.includes('Indexación')));
  assert.ok(result.warnings.some((line) => line.includes('proxy')));
});
