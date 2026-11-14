import { ok, apiError, withErrorHandling } from '@/lib/api/respond';
import { getServiceBySlug } from '@/lib/queries/services';
import {
  getServiceTechnicalHistory,
  parseTechnicalHistoryPeriod,
} from '@/lib/queries/service-technical-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);
  if (!service || !service.active) {
    return apiError('not_found', 'Servicio no disponible');
  }

  const rawPeriod = new URL(request.url).searchParams.get('period');
  const period = parseTechnicalHistoryPeriod(rawPeriod);
  if (!period) {
    return apiError('validation_error', 'Periodo no válido; utiliza 24h, 7d o 30d');
  }

  // A catalog-only entry is not monitored or authorized merely by existing.
  const rows = service.isDemo ? [] : await getServiceTechnicalHistory(service.id, period);

  return ok(rows, {
    period,
    source: 'technical_checks en PostgreSQL',
    observed: !service.isDemo && rows.length > 0,
    maxMeasurements: 200,
    note: service.isDemo
      ? 'Ficha de catálogo sin verificación técnica'
      : 'Resultado de endpoints registrados, no disponibilidad global de la plataforma',
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export const GET = withErrorHandling(handleGET);
