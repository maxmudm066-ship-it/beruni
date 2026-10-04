import { NextResponse } from 'next/server';

/**
 * A redirect that names only where on this site to go, never which host.
 *
 * Turning a path into an absolute address means reading the host off the incoming request, and a
 * request that reached us through a tunnel or a reverse proxy carries the address the proxy used —
 * `localhost` behind Cloudflare Tunnel, an internal name behind nginx. The visitor would then be
 * sent to a machine they cannot reach. A relative `Location` keeps whatever address they came to,
 * which is also what browsers and crawlers expect for a redirect inside one site.
 */
export function redirectTo(pathWithQuery: string, status = 307): NextResponse {
  return new NextResponse(null, { status, headers: { Location: pathWithQuery } });
}
