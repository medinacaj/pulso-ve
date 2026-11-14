import { sql } from 'drizzle-orm';

// Este chequeo mide únicamente conectividad de PostgreSQL.
// No certifica que el motor de monitoreo, el correo o la autenticación funcionen.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(): Promise<Response> {
  const checkedAt = new Date().toISOString();

  try {
    // Importación dentro del try: una DATABASE_URL faltante también devuelve 503.
    const { db } = await import('@/lib/db/client');
    await db.execute(sql`select 1`);

    return Response.json(
      { component: 'postgresql', status: 'ok', checkedAt },
      { status: 200, headers },
    );
  } catch {
    // No incluir URLs, mensajes SQL ni errores con posibles credenciales.
    console.error('PulsoVE: no se pudo comprobar la conexión PostgreSQL');
    return Response.json(
      { component: 'postgresql', status: 'unavailable', checkedAt },
      { status: 503, headers },
    );
  }
}
