import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyCpanelArtifact } from '../scripts/verify-cpanel-artifact.mjs';

async function fixture(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pulsove-artifact-'));
  try {
    await mkdir(path.join(root, '.next/static'), { recursive: true });
    await writeFile(path.join(root, 'server.js'), 'console.log("ready")');
    await writeFile(path.join(root, '.next/static/app.js'), 'console.log("asset")');
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('paquete completo sin secretos conocidos es aceptado', async () => {
  await fixture(async (root) => {
    const result = await verifyCpanelArtifact(root, ['SENSITIVE_BUILD_VALUE']);
    assert.equal(result.files, 2);
  });
});

test('bloquea secretos textuales, archivos .env y enlaces simbólicos', async () => {
  await fixture(async (root) => {
    await writeFile(path.join(root, 'config.json'), '{"key":"SENSITIVE_BUILD_VALUE"}');
    await assert.rejects(verifyCpanelArtifact(root, ['SENSITIVE_BUILD_VALUE']), /confidencial/);
    await rm(path.join(root, 'config.json'));

    await writeFile(path.join(root, '.env.production'), 'SECRET=do-not-distribute');
    await assert.rejects(verifyCpanelArtifact(root, []), /entorno incluido/);
    await rm(path.join(root, '.env.production'));

    await symlink('server.js', path.join(root, 'server-link.js'));
    await assert.rejects(verifyCpanelArtifact(root, []), /simbólico/);
  });
});

test('rechaza artefactos incompletos', async () => {
  await fixture(async (root) => {
    await rm(path.join(root, 'server.js'));
    await assert.rejects(verifyCpanelArtifact(root, []), /server.js/);
  });
});
