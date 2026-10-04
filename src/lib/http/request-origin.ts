import type { NextRequest } from 'next/server';

/**
 * The address the visitor actually used.
 *
 * `request.url` is not it: `next start` builds that value from the address the server bound to, so
 * behind Cloudflare Tunnel, nginx or Caddy it says `localhost:3100` no matter who asked. Redirects
 * built from it send people to a machine on this network instead of the site they came to.
 *
 * The edge proxy knows better and says so in `x-forwarded-host` and `x-forwarded-proto`, and Next
 * fills `x-forwarded-host` from the `Host` header when the proxy is silent about it. A header is
 * only ever taken as one host name: anything with a scheme, a path, credentials or a list in it is
 * dropped and the server's own address is used instead.
 */
function forwardedHost(value: string | null): string | null {
  const first = (value ?? '').split(',')[0].trim();
  return /^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(first) ? first : null;
}

export function requestOrigin(request: NextRequest): string {
  const host = forwardedHost(request.headers.get('x-forwarded-host')) ?? forwardedHost(request.headers.get('host'));
  if (!host) return request.nextUrl.origin;

  const proto = (request.headers.get('x-forwarded-proto') ?? '').split(',')[0].trim();
  if (proto !== 'https' && proto !== 'http') return request.nextUrl.origin;

  return `${proto}://${host}`;
}
