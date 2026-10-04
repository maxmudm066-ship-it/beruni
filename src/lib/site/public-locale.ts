/**
 * Deciding the language of an address that does not carry one.
 *
 * The middleware runs in front of every request, so nothing here may read the database: one query
 * per asset would be the slowest part of the site. That means the language list is the one compiled
 * into the dictionary rather than the one the panel has activated, and `/` is left to its own route
 * handler, which can afford the settings lookup that the proxy cannot.
 */
import { SITE_FALLBACK_LOCALE, SITE_LOCALES } from '@/lib/site/dictionary';

/**
 * Leading path segments that are not a page of the public site. `/admin` is the panel, `/api` is
 * machine traffic, `/uploads` serves files by address, and `/_next` is how the browser fetches the
 * site's own scripts and styles — prefixing any of them would break it.
 */
const NOT_A_PAGE = new Set(['admin', 'api', 'uploads', '_next']);

/** `uz`, `en`, `ru` and a region form like `uz-latn`: anything shaped like a language is taken as one. */
const LANGUAGE_SHAPED = /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/i;

/**
 * The part of an address that still needs a language, or nothing when the request is already fine
 * as it is. Returning null is the common case — every prefixed page, every asset, every file — and
 * the caller then leaves the request completely alone.
 */
export function unprefixedPathname(pathname: string): string | null {
  const [first = '', ...rest] = pathname.split('/').filter(Boolean);
  if (!first) return null;
  if (NOT_A_PAGE.has(first.toLowerCase())) return null;
  if (first.includes('.')) return null;
  if (LANGUAGE_SHAPED.test(first)) return null;
  return `/${[first, ...rest].join('/')}`;
}

/**
 * The languages a browser listed, best match first.
 *
 * `Accept-Language` is a list of `code;q=0.8` entries ordered by preference, but browsers and
 * scripts vary in both the ordering and whether they bother to write the `q`, so the header is
 * sorted rather than trusted.
 */
export function acceptedLanguages(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((entry) => {
      const [code, ...params] = entry.trim().split(';');
      const quality = params.find((param) => param.trim().startsWith('q='));
      return {
        code: code.trim().toLowerCase(),
        quality: quality ? Number.parseFloat(quality.split('=')[1] ?? '1') : 1,
      };
    })
    .filter((entry) => entry.code && Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.code);
}

/**
 * Which language to send an unprefixed request to: the choice the visitor already made on this site,
 * then the first language their browser asked for that the site writes, then the fallback. The
 * remembered code is checked against the list too — a cookie from a site that has since changed
 * hands should not win.
 */
export function negotiateUnprefixed(remembered: string, header: string | null): string {
  const preferred = [remembered, ...acceptedLanguages(header)];
  for (const raw of preferred) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const match = SITE_LOCALES.find((code) => value === code || value.startsWith(`${code}-`));
    if (match) return match;
  }
  return SITE_FALLBACK_LOCALE;
}
