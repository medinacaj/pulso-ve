/** Validate external technical-measurement JSON before using dates in Intl
 * or plotting values. Reject the entire payload rather than inventing points.
 */
export type TechnicalPoint = {
  checkedAt: string;
  success: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorCode: string | null;
  checkType: string;
};

export function parseTechnicalHistoryPoints(input: unknown): TechnicalPoint[] | null {
  if (!Array.isArray(input) || input.length > 200) return null;
  const parsed: TechnicalPoint[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.checkedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(row.checkedAt) ||
      !Number.isFinite(Date.parse(row.checkedAt)) ||
      new Date(row.checkedAt).toISOString().slice(0, 10) !== row.checkedAt.slice(0, 10) ||
      typeof row.success !== 'boolean' ||
      (row.statusCode !== null && !(Number.isInteger(row.statusCode) &&
        Number(row.statusCode) >= 100 && Number(row.statusCode) <= 599)) ||
      (row.latencyMs !== null && !(typeof row.latencyMs === 'number' &&
        Number.isFinite(row.latencyMs) && row.latencyMs >= 0)) ||
      (row.errorCode !== null && typeof row.errorCode !== 'string') ||
      row.checkType !== 'https') return null;
    parsed.push({
      checkedAt: row.checkedAt,
      success: row.success,
      statusCode: row.statusCode as number | null,
      latencyMs: row.latencyMs as number | null,
      errorCode: row.errorCode as string | null,
      checkType: 'https',
    });
  }
  return parsed;
}
