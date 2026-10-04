import { timingSafeEqual } from 'node:crypto';
import { authorize, fail, isErrorResponse, json } from '@/lib/api/guard';
import { publishScheduledItems } from '@/lib/content/schedule';

export const dynamic = 'force-dynamic';

function hasValidSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return false;
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const expected = Buffer.from(secret);
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Publishes materials that reached their scheduled time.
 *
 * Hosting schedulers call this with `Authorization: Bearer $CRON_SECRET`; a plain GET is enough for
 * them because the token, not a cookie, proves who is asking. Without CRON_SECRET only a signed-in
 * super administrator may trigger it, and then only through POST so the same-origin check applies.
 */
export async function GET(request: Request) {
  if (!hasValidSecret(request)) return fail(401, 'Set CRON_SECRET to call this endpoint directly.');
  return run();
}

export async function POST(request: Request) {
  if (!hasValidSecret(request)) {
    const user = await authorize('*', request);
    if (isErrorResponse(user)) return user;
  }
  return run();
}

async function run() {
  const result = await publishScheduledItems();
  return json({ ok: true, ranAt: new Date().toISOString(), published: result.published, failed: result.failed });
}
