import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pruebas unitarias (sin Postgres): la CI ejecuta `test:unit` antes de migrar la base.
vi.mock('../src/lib/db/client', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ slug: 'netflix', updatedAt: new Date() }] }) }),
  },
}));
vi.mock('../src/lib/queries/directory', () => ({
  getCategoryBySlug: vi.fn(),
  getDirectoryServices: vi.fn(),
  getCategoriesWithActiveServices: vi.fn(),
}));

import { categoryHref, serviceHref } from '../src/lib/nav';
import * as directory from '../src/lib/queries/directory';
import sitemap from '../src/app/sitemap';
import CategoryPage, { generateMetadata } from '../src/app/categorias/[slug]/page';

const getCategoryBySlug = vi.mocked(directory.getCategoryBySlug);
const getDirectoryServices = vi.mocked(directory.getDirectoryServices);
const getCategoriesWithActiveServices = vi.mocked(directory.getCategoriesWithActiveServices);

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const oneService = {
  services: [{ slug: 'netflix', name: 'Netflix', description: null, categorySlug: 'streaming', categoryName: 'Streaming',
    reportsLast24h: 0, surgeScore: 0, incidentsAllTime: 0, status: 'insufficient_data' as const }],
  total: 1,
};

describe('rutas dinámicas', () => {
  it('categoryHref y serviceHref codifican el slug', () => {
    expect(categoryHref('banca-y-pagos')).toBe('/categorias/banca-y-pagos');
    expect(serviceHref('a b/c')).toBe('/servicios/a%20b%2Fc');
  });
});

describe('/categorias/[slug]', () => {
  beforeEach(() => {
    getCategoryBySlug.mockReset();
    getDirectoryServices.mockReset();
    getCategoriesWithActiveServices.mockReset().mockResolvedValue([]);
  });

  it('metadata propia: título, canonical relativo y descripción de la semilla', async () => {
    getCategoryBySlug.mockResolvedValue({ slug: 'streaming', name: 'Streaming', description: 'Video y música bajo demanda.' });
    getDirectoryServices.mockResolvedValue(oneService);
    const meta = await generateMetadata(params('streaming'));
    expect(meta.title).toBe('Streaming: estado de los servicios en Venezuela');
    expect(meta.alternates?.canonical).toBe('/categorias/streaming');
    expect(meta.description).toContain('Video y música bajo demanda.');
    expect(meta.description).not.toContain('autorización');
  });

  it('apuestas y loterías lleva el aviso de no promoción también en la descripción', async () => {
    getCategoryBySlug.mockResolvedValue({ slug: 'apuestas-y-loterias', name: 'Apuestas y loterías', description: null });
    getDirectoryServices.mockResolvedValue(oneService);
    const meta = await generateMetadata(params('apuestas-y-loterias'));
    expect(meta.description).toContain('no promueve ni confirma autorización');

    // Si la descripción de la semilla ya trae el aviso, no se repite.
    getCategoryBySlug.mockResolvedValue({ slug: 'apuestas-y-loterias', name: 'Apuestas y loterías',
      description: 'Loterías. PulsoVE no las promueve ni confirma que estén autorizadas.' });
    const seeded = await generateMetadata(params('apuestas-y-loterias'));
    expect(String(seeded.description).match(/autoriza/g)).toHaveLength(1);
  });

  it('categoría inexistente o sin servicios activos → 404 (sin página vacía)', async () => {
    getCategoryBySlug.mockResolvedValue(null);
    await expect(CategoryPage(params('no-existe'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);

    getCategoryBySlug.mockResolvedValue({ slug: 'clima-y-datos', name: 'Clima y datos', description: null });
    getDirectoryServices.mockResolvedValue({ services: [], total: 0 });
    await expect(CategoryPage(params('clima-y-datos'))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    expect((await generateMetadata(params('clima-y-datos'))).title).toBe('Categoría no encontrada');
  });
});

describe('sitemap con categorías', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('incluye solo las categorías con servicios activos, con URL absoluta canónica', async () => {
    process.env.SITE_URL = 'https://ejemplo.org';
    process.env.PUBLIC_INDEXABLE = 'true';
    getCategoriesWithActiveServices.mockResolvedValue([{ slug: 'streaming', name: 'Streaming', total: 3 }]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://ejemplo.org/categorias/streaming');
    expect(urls).toContain('https://ejemplo.org/servicios/netflix');
    expect(urls.filter((u) => u.includes('/categorias/'))).toHaveLength(1);
  });

  it('sin indexación activada sigue vacío', async () => {
    delete process.env.PUBLIC_INDEXABLE;
    expect(await sitemap()).toEqual([]);
  });
});
