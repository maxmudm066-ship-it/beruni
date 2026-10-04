/**
 * The languages the public site speaks.
 *
 * They come from the `languages` table, which the panel manages, so a content manager who adds a
 * fourth language gets a fourth URL prefix without a code change. Everything here is cached per
 * request: a page reads the list several times (the layout, the switcher, hreflang, the menu).
 */
import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { getSiteSetting } from '@/lib/settings';

export interface SiteLanguage {
  code: string;
  /** Shown in the language switcher, in the language itself. */
  nativeName: string;
  /** Name in English, used as a fallback when the switcher has nothing better. */
  name: string;
  urlPrefix: string;
  isDefault: boolean;
}

export const siteLanguages = cache(async (): Promise<SiteLanguage[]> => {
  const rows = await prisma.language.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, name: true, nativeName: true, urlPrefix: true, isDefault: true },
  });
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    nativeName: row.nativeName,
    urlPrefix: row.urlPrefix,
    isDefault: row.isDefault,
  }));
});

/**
 * The language the site opens in. Settings win because that is what the panel writes;
 * `Language.isDefault` and then the first active language are the safety net for a database that
 * was seeded or migrated by hand.
 */
export function defaultLanguageOf(languages: readonly SiteLanguage[], configured: string): string {
  return (
    languages.find((language) => language.code === configured)?.code ??
    languages.find((language) => language.isDefault)?.code ??
    languages[0]?.code ??
    'ru'
  );
}

export const defaultSiteLanguage = cache(async (): Promise<string> => {
  const [languages, configured] = await Promise.all([
    siteLanguages(),
    getSiteSetting('general', 'default_language'),
  ]);
  return defaultLanguageOf(languages, configured);
});

/**
 * The language a visitor who asked for none is given: what they chose last time on this site, then
 * the languages their browser listed, then the default the panel set.
 */
export function negotiateLanguage(
  languages: readonly SiteLanguage[],
  preferred: readonly string[],
  fallback: string,
): string {
  const codes = new Set(languages.map((language) => language.code));
  for (const raw of preferred) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const exact = codes.has(value) ? value : languages.find((language) => value.startsWith(`${language.code}-`))?.code;
    if (exact) return exact;
  }
  return codes.has(fallback) ? fallback : defaultLanguageOf(languages, fallback);
}

export function isSiteLanguage(code: string): boolean {
  return code.length >= 2 && code.length <= 12 && /^[a-z0-9-]+$/i.test(code);
}

/**
 * Address prefixes the old site used for a language this site speaks.
 *
 * Joomla put the Uzbek section behind `/en-ca`, a locale code of its own making, and links to
 * institute texts still carry it: bookmarks, bibliographies on other universities' pages, printed
 * leaflets. Reading such a prefix as the language it held is what gives the stored redirect of that
 * address the chance to answer, since a prefix the site refuses never reaches a page at all.
 */
const LEGACY_PREFIXES: Record<string, string> = { 'en-ca': 'uz' };

/**
 * The language of a requested address, or nothing when the prefix is not one the site speaks.
 * The caller decides what that means: the layout sends the visitor to the language they were
 * asking for in the first place, instead of showing them text in a language they did not choose.
 */
export async function resolveSiteLanguage(requested: string | undefined): Promise<SiteLanguage | null> {
  if (!requested || !isSiteLanguage(requested)) return null;
  const code = LEGACY_PREFIXES[requested.toLowerCase()] ?? requested;
  const languages = await siteLanguages();
  return languages.find((language) => language.code === code || language.urlPrefix === code) ?? null;
}
