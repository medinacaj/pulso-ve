import { access, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function isEnvironmentFile(name) {
  return name === '.env' || name.startsWith('.env.');
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function rejectEnvironmentFiles(folder, relative = '') {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const entryPath = path.join(folder, entry.name);
    const relativePath = path.join(relative, entry.name);
    if (isEnvironmentFile(entry.name)) {
      throw new Error('Archivo de entorno prohibido en paquete: ' + relativePath);
    }
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      await rejectEnvironmentFiles(entryPath, relativePath);
    }
  }
}

/**
 * Stage the already-built Next.js standalone artifact for Namecheap cPanel.
 * Does not build, upload, migrate, run cron, or connect to production.
 * cPanel's Application startup file is server.js in the staged root.
 */
export async function prepareCpanel(root = process.cwd()) {
  const sourceRoot = path.resolve(root);
  const standalone = path.join(sourceRoot, '.next', 'standalone');
  const staticAssets = path.join(sourceRoot, '.next', 'static');
  const publicAssets = path.join(sourceRoot, 'public');
  const preflight = path.join(sourceRoot, 'scripts', 'preflight-namecheap.mjs');
  const deployGuide = path.join(sourceRoot, 'docs', 'DESPLIEGUE-NAMECHEAP.md');

  if (!(await exists(path.join(standalone, 'server.js')))) {
    throw new Error('Falta .next/standalone/server.js. Ejecuta npm run build primero.');
  }
  if (!(await exists(staticAssets))) {
    throw new Error('Falta .next/static. Ejecuta npm run build primero.');
  }
  if (!(await exists(preflight))) {
    throw new Error('Falta scripts/preflight-namecheap.mjs para verificar la instalación.');
  }
  if (!(await exists(deployGuide))) {
    throw new Error('Falta docs/DESPLIEGUE-NAMECHEAP.md para incluir la guía de instalación.');
  }

  await rejectEnvironmentFiles(standalone);
  if (await exists(publicAssets)) await rejectEnvironmentFiles(publicAssets, 'public');

  // Next.js intentionally omits static assets from its standalone build.
  await cp(staticAssets, path.join(standalone, '.next', 'static'), {
    recursive: true,
    force: true,
  });
  if (await exists(publicAssets)) {
    await cp(publicAssets, path.join(standalone, 'public'), {
      recursive: true,
      force: true,
    });
  }

  // Copy read-only startup preflight into application root for the hosting owner.
  await cp(preflight, path.join(standalone, 'preflight-namecheap.mjs'));
  await cp(deployGuide, path.join(standalone, 'INSTALACION-NAMECHEAP.md'));
  await rejectEnvironmentFiles(standalone);
  return standalone;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareCpanel()
    .then((directory) => {
      console.log('Paquete de cPanel preparado en ' + path.relative(process.cwd(), directory));
      console.log('Inicio: server.js; alojamiento: directorio de aplicación fuera de public_html.');
    })
    .catch((error) => {
      console.error('No se pudo preparar paquete de cPanel: ' + error.message);
      process.exitCode = 1;
    });
}
