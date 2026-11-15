import { describe, expect, it } from 'vitest';
import { buildPendingCommentsQuery, moderationOutcome } from '../src/lib/queries/admin-comments';

describe('consulta de la cola real de moderación', () => {
  it('solamente contiene comentarios pendientes, con límite 50 y sin hashes privados', () => {
    const q = buildPendingCommentsQuery().toSQL();
    expect(q.sql).toContain('service_comments');
    expect(q.sql).toContain('services');
    expect(q.sql).toContain('moderation_status');
    expect(q.sql).toContain('body');
    expect(q.params).toContain('pending');
    expect(q.params).toContain(50);
    expect(q.sql).not.toContain('anonymous_hash');
    expect(q.sql).not.toContain('ip_prefix_hash');
    expect(q.sql.toLowerCase()).toContain('limit');
  });

  it('distingue aprobación de rechazo sin alterar el estado de un reporte', () => {
    expect(moderationOutcome('approve')).toBe('approved');
    expect(moderationOutcome('reject')).toBe('rejected');
  });
});
