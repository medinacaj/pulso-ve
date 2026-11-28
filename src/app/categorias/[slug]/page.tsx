import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCategoriesWithActiveServices, getCategoryBySlug, getDirectoryServices } from '@/lib/queries/directory';
import { ViewToggleProvider } from '@/components/directory/ViewToggle';
import { ServiceGrid } from '@/components/directory/ServiceGrid';
import { ROUTE, categoryHref } from '@/lib/nav';
import { EngineFreshnessNotice } from '@/components/ui/EngineFreshnessNotice';
import { getEngineFreshness } from '@/lib/queries/engine';

// Datos en vivo (estado y reportes): se renderiza en cada petición.
export const dynamic = 'force-dynamic';

const GAMBLING_CATEGORY_SLUG = 'apuestas-y-loterias';
const GAMBLING_DISCLAIMER =
  'PulsoVE solo informa de disponibilidad técnica. Su inclusión no promueve ni confirma autorización de estos servicios.';

type Params = Promise<{ slug: string }>;

// Una categoría inexistente o sin servicios activos sería una página vacía: 404 real
// (y queda fuera del sitemap y de los enlaces internos).
async function loadCategory(slug: string) {
  const category = await getCategoryBySlug(slug);
  if (!category) return null;
  const { services, total } = await getDirectoryServices({ category: category.slug, sort: 'alphabetical' });
  if (total === 0) return null;
  return { category, services, total };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCategory(slug);
  if (!data) return { title: 'Categoría no encontrada' };
  const { category } = data;
  return {
    // El layout añade « | PulsoVE ».
    title: `${category.name}: estado de los servicios en Venezuela`,
    alternates: { canonical: categoryHref(category.slug) },
    // La descripción es la de la semilla (texto propio, no inventado aquí).
    // En apuestas y loterías el aviso de no promoción va siempre (salvo que la semilla ya lo diga).
    description: [
      category.description ?? category.name,
      category.slug === GAMBLING_CATEGORY_SLUG && !/autorizad/i.test(category.description ?? '') ? GAMBLING_DISCLAIMER : null,
      'Reportes ciudadanos y estado de cada servicio en Venezuela.',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export default async function CategoryPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await loadCategory(slug);
  if (!data) notFound();
  const { category, services, total } = data;
  const [allCategories, freshness] = await Promise.all([getCategoriesWithActiveServices(), getEngineFreshness()]);
  const otherCategories = allCategories.filter((c) => c.slug !== category.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <EngineFreshnessNotice freshness={freshness} className="mb-5" />
      <nav aria-label="Ruta de navegación" className="mb-5 text-sm text-ink-muted">
        <Link href={ROUTE.services.href} className="underline underline-offset-2 hover:text-ink">
          Todos los servicios
        </Link>
        <span aria-hidden="true" className="px-2">/</span>
        {category.name}
      </nav>

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{category.name}</h1>
        <p className="shrink-0 font-mono text-sm text-ink-muted tabular-nums">
          {total} {total === 1 ? 'servicio' : 'servicios'}
        </p>
      </div>
      {category.description && <p className="mt-2 max-w-3xl text-ink-muted">{category.description}</p>}
      <p className="mt-2 max-w-3xl text-sm text-ink-muted">
        El estado de cada servicio se calcula con reportes ciudadanos agregados. Sin datos suficientes se indica así;
        no equivale a un funcionamiento normal confirmado.
      </p>

      {category.slug === GAMBLING_CATEGORY_SLUG && (
        <p className="mt-4 rounded border border-border bg-bg px-3 py-2 text-xs text-ink-muted">{GAMBLING_DISCLAIMER}</p>
      )}

      <div className="mt-8">
        <ViewToggleProvider>
          <ServiceGrid services={services} />
        </ViewToggleProvider>
      </div>

      {otherCategories.length > 0 && (
        <section className="mt-12 border-t border-border pt-6" aria-labelledby="otras-categorias">
          <h2 id="otras-categorias" className="font-display text-base font-semibold">
            Otras categorías
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {otherCategories.map((c) => (
              <li key={c.slug}>
                <Link href={categoryHref(c.slug)} className="text-ink-muted underline-offset-4 hover:text-ink hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
