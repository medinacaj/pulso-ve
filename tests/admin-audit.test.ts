import { describe, expect, it } from 'vitest';
import { buildRecentAuditEventsQuery } from '../src/lib/queries/admin-audit';

describe('visor administrativo de auditoría', () => {
  it('solo proyecta tipo, acción y hora, sin JSON privados, IP ni usuarios', () => {
    const q = buildRecentAuditEventsQuery().toSQL();
    expect(q.sql).toContain('audit_logs');
    expect(q.sql).toContain('action');
    expect(q.sql).toContain('entity');
    expect(q.sql).toContain('created_at');
    expect(q.sql).toContain('limit');
    expect(q.params).toContain(100);
    expect(q.sql).not.toContain('"before"');
    expect(q.sql).not.toContain('"after"');
    expect(q.sql).not.toContain('"ip_hash"');
    expect(q.sql).not.toContain('"user_id"');
    expect(q.sql.toLowerCase()).toContain('order by');
  });
});
