'use client';

import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TechnicalHistoryPeriod } from '@/lib/queries/service-technical-history';

import { parseTechnicalHistoryPoints, type TechnicalPoint } from '@/lib/queries/technical-history-points';

const PERIODS: readonly { key: TechnicalHistoryPeriod; label: string }[] = [
  { key: '24h', label: '24 horas' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
];

function labelTime(iso: string) {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function TechnicalHistoryChart({
  serviceSlug,
  initial,
  catalogOnly,
}: {
  serviceSlug: string;
  initial: TechnicalPoint[];
  catalogOnly: boolean;
}) {
  const [period, setPeriod] = useState<TechnicalHistoryPeriod>('24h');
  const [mode, setMode] = useState<'line' | 'bars'>('line');
  const [points, setPoints] = useState<TechnicalPoint[]>(() => parseTechnicalHistoryPoints(initial) ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);

  async function choosePeriod(next: TechnicalHistoryPeriod) {
    if (next === period || catalogOnly) return;
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setPeriod(next);
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        '/api/services/' + encodeURIComponent(serviceSlug) + '/technical-checks?period=' + next,
        { cache: 'no-store', signal: controller.signal },
      );
      if (!response.ok) throw new Error('request_failed');
      const payload: { data?: unknown } = await response.json();
      const validated = parseTechnicalHistoryPoints(payload?.data);
      if (!validated) throw new Error('invalid_response');
      if (!controller.signal.aborted) setPoints(validated);
    } catch {
      if (!controller.signal.aborted) {
        setError(true);
        setPoints([]);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const good = points.filter((point) => point.success).length;
  const failures = points.length - good;
  const latencySamples = points.filter((p) => p.success && p.latencyMs !== null);
  const averageLatency = latencySamples.length
    ? Math.round(latencySamples.reduce((sum, p) => sum + (p.latencyMs ?? 0), 0) / latencySamples.length)
    : null;
  const rows = points.map((point, index) => ({
    ...point,
    sample: index + 1,
    timeLabel: labelTime(point.checkedAt),
  }));

  return (
    <section className="service-detail-panel mt-6 min-w-0 rounded-xl border border-border bg-surface p-5 sm:p-7"
      aria-labelledby="technical-history-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="technical-history-title" className="font-display text-xl font-semibold">
            Mediciones técnicas registradas
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Observaciones HTTPS reales guardadas en PostgreSQL. Cada punto corresponde a un
            endpoint específico; no representa la disponibilidad global del proveedor ni
            confirma por sí solo una interrupción.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1" aria-label="Periodo técnico">
          {PERIODS.map(({ key, label }) => (
            <button type="button" key={key} aria-pressed={period === key}
              disabled={catalogOnly || loading}
              onClick={() => void choosePeriod(key)}
              className={'rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ' +
                (period === key ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-bg')}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {catalogOnly && (
        <p role="status" className="mt-5 rounded-lg border border-dashed border-border p-5 text-sm text-ink-muted">
          Esta ficha pertenece al catálogo, pero aún no posee una fuente técnica verificada.
          No se generan curvas ni porcentajes ficticios.
        </p>
      )}

      {!catalogOnly && (
        <>
          {loading && <p role="status" className="mt-3 text-xs text-ink-muted">Consultando mediciones registradas…</p>}
          {error && <p role="alert" className="mt-3 text-xs text-red-700">No se pudieron consultar las mediciones de este periodo.</p>}
          <dl className="mt-5 grid gap-3 rounded-lg bg-bg p-4 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-ink-muted">Muestras consultadas (máx. 200)</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">{points.length}</dd></div>
            <div><dt className="text-xs text-ink-muted">Intentos no satisfactorios</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">{failures}</dd></div>
            <div><dt className="text-xs text-ink-muted">Latencia media en respuestas satisfactorias</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {averageLatency === null ? 'Sin datos' : averageLatency + ' ms'}
              </dd></div>
          </dl>

          {points.length === 0 ? (
            <p role="status" className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-ink-muted">
              No hay comprobaciones técnicas persistidas en este periodo.
              La ausencia de mediciones no significa que el servicio funcione correctamente.
            </p>
          ) : (
            <>
              <div className="mt-5 flex items-center justify-between gap-3">
                <p className="text-xs text-ink-muted">
                  Duración observada por intento (ms). {good} respuestas satisfactorias de {points.length} muestras.
                </p>
                <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
                  {(['line', 'bars'] as const).map((key) => (
                    <button key={key} type="button" aria-pressed={mode === key}
                      onClick={() => setMode(key)}
                      className={'rounded-md px-3 py-2 text-xs font-semibold ' +
                        (mode === key ? 'bg-pulse-600 text-white' : 'text-ink-muted hover:bg-bg')}>
                      {key === 'line' ? 'Línea' : 'Barras'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 h-[260px] w-full min-w-0 sm:h-[320px]"
                role="img" aria-label="Histórico de duración de comprobaciones HTTPS registradas">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} strokeOpacity={0.3} />
                    <XAxis dataKey="timeLabel" minTickGap={25} tick={{ fontSize: 10 }} />
                    <YAxis unit=" ms" tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(_label, payload) =>
                        payload && payload[0]?.payload?.checkedAt
                          ? labelTime(String(payload[0].payload.checkedAt))
                          : ''}
                      formatter={(value) => [Number(value).toLocaleString('es-VE') + ' ms', 'Duración de intento']}
                      contentStyle={{ borderRadius: 10, fontSize: 12 }}
                    />
                    {mode === 'line' && <Line type="linear" dataKey="latencyMs" name="Latencia"
                      stroke="#008a79" strokeWidth={2} dot={rows.length < 30} connectNulls={false} isAnimationActive={false} />}
                    {mode === 'bars' && <Bar dataKey="latencyMs" name="Latencia" fill="#16a995" maxBarSize={28}
                      isAnimationActive={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <h3 className="mt-5 text-sm font-semibold">Últimos resultados observados</h3>
              <ul className="mt-2 divide-y divide-border text-xs" aria-label="Últimas comprobaciones HTTPS">
                {[...points].reverse().slice(0, 5).map((point, index) => (
                  <li key={point.checkedAt + '-' + index}
                    className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="text-ink-muted">{labelTime(point.checkedAt)}</span>
                    <span className={point.success ? 'font-semibold text-ink' : 'font-semibold text-red-700'}>
                      {point.success ? 'Respuesta satisfactoria' : 'Respuesta fallida'}
                      {point.statusCode ? ' · HTTP ' + point.statusCode : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Máximo 200 mediciones por consulta. Los errores HTTP, de red o TLS describen
            intentos individuales; no representan un porcentaje de disponibilidad.
            Hora de Venezuela (Caracas).
          </p>
        </>
      )}
    </section>
  );
}
