import { access, lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SENSITIVE_NAMES = [
  'DATABASE_URL', 'ANONYMIZATION_SALT', 'JWT_SECRET', 'REDIS_URL',
  'TURNSTILE_SECRET_KEY', 'SMTP_PASS', 'SMTP_PASSWORD',
];
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.html', '.css', '.txt', '.map', '.yaml', '.yml']);

function secretValuesFromEnvironment() {
  return SENSITIVE_NAMES.map((key) => process.env[key] ?? '')
    .filter((value) => value.length >= 12);
}

/**
 * Last gate before distributing an artifact to the hosting operator.
 * Verifies file structure and searches distributed text for known live
 * build-time secret values. It does not replace a complete security audit.
 */
export async function verifyCpanelArtifact(
  root = path.resolve('.next/standalone'),
  forbiddenValues = secretValuesFromEnvironment(),
) {
  const startup = path.join(root, 'server.js');
  const staticDir = path.join(root, '.next/static');
  await access(startup).catch(() => {
    throw new Error('Artefacto incompleto: falta server.js');
  });
  await access(staticDir).catch(() => {
    throw new Error('Artefacto incompleto: falta .next/static');
  });

  let files = 0;
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full);
      if (entry.name === '.env' || entry.name.startsWith('.env.')) {
        throw new Error('Archivo de entorno incluido: ' + relative);
      }
      if (entry.isSymbolicLink()) {
        // Next.js standalone may legitimately link bcryptjs and traced modules.
        // Allow only *existing* targets whose canonical path remains inside
        // the package root. Never follow links outside the distributable.
        let resolved;
        try {
          resolved = await realpath(full);
        } catch {
          throw new Error('Enlace simbólico roto en paquete: ' + relative);
        }
        const inside = path.relative(root, resolved);
        if (inside === '..' || inside.startsWith('..' + path.sep) || path.isAbsolute(inside)) {
          throw new Error('Enlace simbólico fuera del paquete: ' + relative);
        }
        continue;
      }
      if (entry.isDirectory()) {
        await inspect(full);
        continue;
      }
      if (!entry.isFile()) continue;
      files++;
      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const stat = await lstat(full);
        if (stat.size > 20 * 1024 * 1024) {
          throw new Error('Archivo de texto demasiado grande para validar: ' + relative);
        }
        const content = await readFile(full, 'utf8');
        for (const value of forbiddenValues) {
          if (value.length >= 12 && content.includes(value)) {
            throw new Error('Un valor confidencial de compilación aparece en: ' + relative);
          }
        }
      }
    }
  }

  await inspect(root);
  if (files < 2) throw new Error('Artefacto sin recursos estáticos');
  return { files, root };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyCpanelArtifact().then(
    (result) => console.log('Paquete verificado: ' + result.files + ' archivos, sin secretos conocidos detectados'),
    (error) => {
      console.error('Paquete rechazado: ' + error.message);
      process.exitCode = 1;
    },
  );
}
