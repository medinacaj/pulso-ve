import type { MetadataRoute } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { services } from '@/lib/db/schema';
import { canonical, indexable } from '@/lib/seo';
import { ROUTE, categoryHref, isRouteAvailable, serviceHref } from '@/lib/nav';
import { getCategoriesWithActiveServices } from '@/lib/queries/directory';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!indexable()) return [];
  const paths: string[] = Object.values(ROUTE).filter(isRouteAvailable).map(route => route.href);
  const rows = await db.select({ slug: services.slug, updatedAt: services.updatedAt })
    .from(services).where(eq(services.active, true));
  for (const item of rows) paths.push(serviceHref(item.slug));
  // Solo categorías con servicios activos: las vacías responden 404.
  for (const category of await getCategoriesWithActiveServices()) paths.push(categoryHref(category.slug));
  const unique = [...new Set(paths)].sort();
  return unique.map((path) => ({ url: canonical(path)!, changeFrequency: 'daily' as const,
    priority: path === '/' ? 1 : path === '/servicios' ? 0.8 : path.startsWith('/categorias/') ? 0.7 : 0.6 }));
}
