import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareCpanel } from '../scripts/prepare-cpanel.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pulsove-cpanel-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function file(root, name, content) {
  const location = path.join(root, name);
  await mkdir(path.dirname(location), { recursive: true });
  await writeFile(location, content);
}

test('prepara el runtime standalone con los assets, preservando server.js', async () => {
  await fixture(async (root) => {
    await file(root, '.next/standalone/server.js', 'console.log("runtime");');
    await file(root, '.next/static/css/app.css', '.app{}');
    await file(root, 'public/icons/favicon.svg', '<svg/>');

    const dir = await prepareCpanel(root);
    assert.equal(dir, path.join(root, '.next/standalone'));
    assert.match(await readFile(path.join(dir, 'server.js'), 'utf8'), /runtime/);
    assert.equal(await readFile(path.join(dir, '.next/static/css/app.css'), 'utf8'), '.app{}');
    assert.equal(await readFile(path.join(dir, 'public/icons/favicon.svg'), 'utf8'), '<svg/>');

    await prepareCpanel(root);
    assert.equal(await readFile(path.join(dir, '.next/static/css/app.css'), 'utf8'), '.app{}');
  });
});

test('no acepta un build incompleto', async () => {
  await fixture(async (root) => {
    await assert.rejects(prepareCpanel(root), /standalone\/server\.js/);
    await file(root, '.next/standalone/server.js', 'ok');
    await assert.rejects(prepareCpanel(root), /Falta \.next\/static/);
  });
});

test('rechaza secretos .env* en el artefacto o en public antes de copiar', async () => {
  await fixture(async (root) => {
    await file(root, '.next/standalone/server.js', 'ok');
    await file(root, '.next/static/css/app.css', 'ok');
    await file(root, '.next/standalone/.env.production', 'SECRET=never-publish');
    await assert.rejects(prepareCpanel(root), /Archivo de entorno prohibido/);
    await rm(path.join(root, '.next/standalone/.env.production'));
    await file(root, 'public/nested/.env.local', 'SECRET=never-publish');
    await assert.rejects(prepareCpanel(root), /Archivo de entorno prohibido/);
  });
});

test('funciona si no existe carpeta public', async () => {
  await fixture(async (root) => {
    await file(root, '.next/standalone/server.js', 'ok');
    await file(root, '.next/static/chunks/app.js', 'ok');
    await prepareCpanel(root);
    assert.equal(await readFile(path.join(root, '.next/standalone/.next/static/chunks/app.js'), 'utf8'), 'ok');
  });
});
