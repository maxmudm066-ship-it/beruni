import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SITE_LOCALE_COOKIE, SITE_LOCALE_COOKIE_MAX_AGE } from '@/lib/site/cookie';
import { negotiateUnprefixed, unprefixedPathname } from '@/lib/site/public-locale';

const SESSION_COOKIE = 'beruni_admin_session';

/** Reachable without a session: the sign-in form, the 2FA step, the "no access" notice. */
function isPublicAdminPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '/admin/login' || clean.startsWith('/admin/login/') || clean === '/admin/no-access';
}

/**
 * Optimistic route protection only: a cookie presence check, nothing else.
 * Session tokens are opaque and stored as SHA-256 hashes, so validating one here would
 * mean a database round-trip on every request. Real authentication and authorization run
 * in each page and Server Action through requireUser() / requirePermission() — Next 16
 * puts those checks at the leaf, because layouts do not re-render on client navigation.
 */
function guardAdmin(request: NextRequest, pathname: string, search: string) {
  if (isPublicAdminPath(pathname)) return NextResponse.next();

  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL('/admin/login', request.url);
    if (pathname !== '/admin') url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Two jobs, in the one place that sees every request before the site does.
 *
 * The first is the admin guard, which is optimistic by design: see `guardAdmin`.
 *
 * The second is putting a language into an address that has none. Every public page lives under
 * `/{language}`, so a link like `/news` — typed by hand, or left over from the old site — has
 * nowhere to land. Rather than losing the path in a bounce to the front page, the visitor is sent
 * to the same address with a language in front of it, and the language is the one their cookie,
 * then their browser, asked for. Temporary on purpose, like the front page redirect: a permanent
 * one would be cached by browsers and keep the other languages out of reach.
 *
 * The database stays out of both. `/` is the exception — it is the one unprefixed address the site
 * serves itself, because choosing the language to open in needs the settings the proxy cannot read.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/admin')) return guardAdmin(request, pathname, search);

  const rest = unprefixedPathname(pathname);
  if (!rest) return NextResponse.next();

  const code = negotiateUnprefixed(request.cookies.get(SITE_LOCALE_COOKIE)?.value ?? '', request.headers.get('accept-language'));

  const url = new URL(request.url);
  url.pathname = `/${code}${rest}`;

  const response = NextResponse.redirect(url, 307);
  response.cookies.set(SITE_LOCALE_COOKIE, code, {
    path: '/',
    maxAge: SITE_LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/((?!_next/|api/|uploads/).*)'],
};
