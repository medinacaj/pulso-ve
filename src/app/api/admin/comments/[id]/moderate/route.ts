import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { serviceComments, auditLogs } from '@/lib/db/schema';
import { getAuthorizedAdmin } from '@/lib/auth/admin-session';
import { isAdminWriteOriginAllowed, readAdminSettings } from '@/lib/auth/admin-security';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { moderationOutcome } from '@/lib/queries/admin-comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }).strict(),
  z.object({
    action: z.literal('reject'),
    reason: z.string().trim().min(5).max(240),
  }).strict(),
]);

function respond(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let settings;
  try {
    settings = readAdminSettings();
  } catch {
    return respond(503, { error: 'admin_disabled' });
  }
  if (!isAdminWriteOriginAllowed(request, settings.siteOrigin)) {
    return respond(403, { error: 'forbidden_origin' });
  }

  const admin = await getAuthorizedAdmin();
  if (!admin) return respond(401, { error: 'unauthorized' });

  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return respond(400, { error: 'invalid_id' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond(400, { error: 'invalid_json' });
  }
  const validated = schema.safeParse(body);
  if (!validated.success) return respond(400, { error: 'invalid_action' });

  try {
    const limit = await checkRateLimit('admin:moderation:' + admin.id, 60, 900);
    if (!limit.allowed) return respond(429, { error: 'rate_limited' });

    const nextStatus = moderationOutcome(validated.data.action);
    const output = await db.transaction(async (tx) => {
      // Atomic pending-only transition: simultaneous admins/retries cannot
      // approve or reject an already decided comment.
      const [changed] = await tx.update(serviceComments)
        .set({ moderationStatus: nextStatus, moderatedAt: new Date() })
        .where(and(
          eq(serviceComments.id, id),
          eq(serviceComments.moderationStatus, 'pending'),
        ))
        .returning({ id: serviceComments.id });

      if (!changed) return null;
      await tx.insert(auditLogs).values({
        userId: admin.id,
        action: validated.data.action === 'approve' ? 'comment_approved' : 'comment_rejected',
        entity: 'service_comments',
        entityId: id,
        before: { moderationStatus: 'pending' },
        after: {
          moderationStatus: nextStatus,
          ...(validated.data.action === 'reject' ? { reason: validated.data.reason } : {}),
        },
      });
      return { id, status: nextStatus };
    });

    if (!output) return respond(409, { error: 'already_moderated_or_missing' });
    return respond(200, { data: output });
  } catch {
    console.error('PulsoVE: error al moderar comentario');
    return respond(503, { error: 'temporarily_unavailable' });
  }
}
