import type { MetadataRoute } from 'next';
import { canonical, indexable } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/**
 * Rastreo permitido siempre; la indexación la decide `noindex` (layout) mientras
 * `PUBLIC_INDEXABLE` no sea `true`. Bloquear todo con `Disallow: /` impediría que
 * los buscadores leyeran ese `noindex`, y una URL enlazada desde fuera podría
 * indexarse sin contenido. Decisión de la persona propietaria, 2026-11-28.
 *
 * Solo se excluye la API (JSON sin valor de búsqueda). No se listan rutas
 * administrativas: se protegen con autenticación y `noindex`, y nombrarlas aquí
 * solo las anunciaría.
 */
export default function robots(): MetadataRoute.Robots {
  const rules = [{ userAgent: '*', allow: '/', disallow: ['/api/'] }];
  if (!indexable()) return { rules };
  return { rules, sitemap: canonical('/sitemap.xml')! };
}
