import { NextResponse, type NextRequest } from 'next/server';
import { SITE_LOCALE_COOKIE, SITE_LOCALE_COOKIE_MAX_AGE } from '@/lib/site/cookie';
import { acceptedLanguages } from '@/lib/site/public-locale';
import { defaultSiteLanguage, negotiateLanguage, siteLanguages } from '@/lib/site/languages';

/**
 * The address a visitor types when they type nothing: `/`.
 *
 * Every page lives under a language prefix, so this only has to pick one and get the visitor there.
 * A choice they made on this site earlier (stored in a cookie) beats the browser's language, which
 * beats the default the panel set in Settings. The redirect is temporary on purpose: a permanent one
 * would be remembered by browsers and make the other languages unreachable.
 *
 * This is the one place that reads the live language list while choosing, which is why it is a route
 * handler and not the proxy: the proxy answers every request, including the site's own scripts.
 */
export async function GET(request: NextRequest) {
  const [languages, fallback] = await Promise.all([siteLanguages(), defaultSiteLanguage()]);
  const remembered = request.cookies.get(SITE_LOCALE_COOKIE)?.value ?? '';
  const code = negotiateLanguage(languages, [remembered, ...acceptedLanguages(request.headers.get('accept-language'))], fallback);

  const url = new URL(`/${code}`, request.url);
  url.search = request.nextUrl.search;

  const response = NextResponse.redirect(url, 307);
  response.cookies.set(SITE_LOCALE_COOKIE, code, {
    path: '/',
    maxAge: SITE_LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  return response;
}
