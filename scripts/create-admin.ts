/**
 * Explicit one-time bootstrap of a single admin account.
 * Never runs during npm build, migration, seed or deployment.
 * Configure private ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db/client';
import { users } from '../src/lib/db/schema';
import { readAdminSettings } from '../src/lib/auth/admin-security';

async function main() {
  readAdminSettings();
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw Error('Correo de administrador inválido');
  }
  if (password.length < 16 || Buffer.byteLength(password, 'utf8') > 72) {
    throw Error('Contraseña de administrador debe tener al menos 16 caracteres y como máximo 72 bytes');
  }

  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  if (existingAdmin) {
    throw Error('Ya existe un administrador. El bootstrap no modifica privilegios existentes.');
  }

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail) {
    throw Error('Ya existe esa cuenta. El bootstrap no la convierte en administrador.');
  }

  const hash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    passwordHash: hash,
    role: 'admin',
    status: 'active',
  });

  console.log('Cuenta administrativa creada. Activa MFA TOTP desde el secreto privado configurado.');
  console.log('No se envió verificación de correo; este bootstrap es solo para staging hasta implementar correo.');
}

main().then(
  () => process.exit(0),
  () => {
    console.error('No se pudo completar el bootstrap administrativo. Revisar configuración y permisos.');
    process.exit(1);
  },
);
