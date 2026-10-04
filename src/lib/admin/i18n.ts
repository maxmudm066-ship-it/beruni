/**
 * Server-side half of the admin language layer: it reads the language cookie, so it cannot
 * be imported from a Client Component. Panel strings live in ./labels.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_LOCALES, localeOf, type AdminLocale } from './labels';

export * from './labels';

export const ADMIN_LOCALE_COOKIE = 'beruni_admin_locale';

export function isAdminLocale(value: unknown): value is AdminLocale {
  return typeof value === 'string' && (ADMIN_LOCALES as readonly string[]).includes(value);
}

/** Cookie override first, then the caller's saved preference, then Russian. */
export async function getAdminLocale(fallback: AdminLocale = 'ru'): Promise<AdminLocale> {
  const store = await cookies();
  const cookie = store.get(ADMIN_LOCALE_COOKIE)?.value;
  if (cookie && isAdminLocale(cookie)) return cookie;
  return fallback;
}

/**
 * The language the person acting is reading the panel in right now — the same rule the screens use.
 * A reply from a Server Action has to follow it, otherwise an interface in English answers in Russian.
 */
export async function actorLocale(language: string | null | undefined): Promise<AdminLocale> {
  return getAdminLocale(localeOf(language));
}
