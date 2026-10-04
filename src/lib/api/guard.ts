import 'server-only';
import { actorLocale, getAdminLocale, translate } from '@/lib/admin/i18n';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';

export function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body as never, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>): Response {
  return json({ ok: false, error, ...extra }, { status });
}

/**
 * Session + RBAC + same-origin check for the JSON API. Cookies are SameSite=Lax, which already
 * stops a cross-site form post; the Origin check covers fetch() requests that carry a unsafe method.
 */
export async function authorize(permission: string, request?: Request): Promise<SessionUser | Response> {
  const user = await getSessionUser();
  // Nobody is signed in, so the only language clue left is the panel's own cookie.
  if (!user) return fail(401, translate(await getAdminLocale(), 'error.sessionExpired'));

  if (!user.permissions.includes('*') && !user.permissions.includes(permission)) {
    return fail(403, translate(await actorLocale(user.language), 'error.noPermission'));
  }

  if (request && request.method !== 'GET' && request.method !== 'HEAD') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host && origin !== `https://${host}` && origin !== `http://${host}`) {
      return fail(403, translate(await actorLocale(user.language), 'error.crossOrigin'));
    }
  }

  return user;
}

export function isErrorResponse(value: SessionUser | Response): value is Response {
  return value instanceof Response;
}
