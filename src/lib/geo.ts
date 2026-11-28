/**
 * Estado sugerido para el formulario de reporte a partir de las cabeceras de ubicación
 * que añade el hosting o la CDN delante del sitio. No consulta servicios de terceros, no
 * usa coordenadas ni GPS, no baja de estado y no se guarda: solo preselecciona el
 * desplegable, que la persona puede cambiar.
 *
 * Desactivado por defecto. Se activa con `GEO_HINT_HEADERS`, igual que
 * `TRUSTED_CLIENT_IP_HEADER`: solo cuando el proveedor que está delante del sitio
 * escribe esas cabeceras.
 * - `cloudflare`: `cf-ipcountry` + `cf-region-code`. La segunda requiere activar la
 *   transformación «Add visitor location headers» en el panel de Cloudflare.
 * - `vercel`: `x-vercel-ip-country` + `x-vercel-ip-country-region`.
 * País en ISO 3166-1 y región en ISO 3166-2, con o sin el prefijo «VE-».
 *
 * Un cliente puede enviar esas cabeceras a mano: es inocuo, porque solo cambia la
 * preselección de su propio formulario; el estado lo elige y envía la persona.
 * NO VERIFICADO contra Cloudflare ni Vercel reales. Namecheap (cPanel) sin Cloudflare
 * delante no envía estas cabeceras: allí no habrá sugerencia.
 */
const PROVIDERS = {
  cloudflare: { country: 'cf-ipcountry', region: 'cf-region-code' },
  vercel: { country: 'x-vercel-ip-country', region: 'x-vercel-ip-country-region' },
} as const;

export type GeoHintProvider = keyof typeof PROVIDERS;

export function geoHintProvider(value: string | undefined = process.env.GEO_HINT_HEADERS): GeoHintProvider | null {
  const key = value?.trim().toLowerCase();
  return key === 'cloudflare' || key === 'vercel' ? key : null;
}

export function suggestStateCode(
  headers: Pick<Headers, 'get'>,
  validCodes: ReadonlySet<string>,
  provider: GeoHintProvider | null = geoHintProvider(),
): string | null {
  if (!provider) return null;
  const names = PROVIDERS[provider];
  if (headers.get(names.country)?.trim().toUpperCase() !== 'VE') return null;
  const raw = headers.get(names.region)?.trim().toUpperCase();
  if (!raw) return null;
  const code = raw.startsWith('VE-') ? raw : `VE-${raw}`;
  return /^VE-[A-Z]$/.test(code) && validCodes.has(code) ? code : null;
}
