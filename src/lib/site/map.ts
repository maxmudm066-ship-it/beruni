/**
 * The piece of a map the site is allowed to draw inside its own pages.
 *
 * Settings hold an ordinary link — whatever a person copied from a map service. A frame needs the
 * address that service reserves for embedding, and the services spell it differently, so the two the
 * institute uses are converted here and anything else is shown as it was given. An address typed in
 * Settings is never pasted into a frame: only `https` links are, and a link that cannot be parsed is
 * dropped rather than guessed at.
 */

/** `https` only: a frame loads a page, so the site insists on naming what it loads. */
function parsed(link: string): URL | null {
  try {
    const url = new URL(link.trim());
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** An address written in Settings is enough to ask a map for; nothing else is pasted into a frame. */
function byAddress(address: string): string | null {
  const where = address.trim();
  if (!where) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(where)}&z=16&output=embed`;
}

/** An address to show in a frame, or nothing when the link cannot be embedded. */
export function mapFrameSrc(link: string, address: string): string | null {
  const url = parsed(link);
  if (url) {
    const host = url.hostname.toLowerCase();

    if (host.endsWith('google.com') && url.pathname.startsWith('/maps')) {
      url.searchParams.set('output', 'embed');
      return url.toString();
    }

    if (host.includes('yandex')) {
      const widget = new URL('https://yandex.ru/map-widget/v1/');
      const where = url.searchParams.get('text') ?? url.searchParams.get('query') ?? url.searchParams.get('q');
      const point = url.searchParams.get('ll');
      if (where) widget.searchParams.set('text', where);
      else if (point) {
        widget.searchParams.set('ll', point);
        widget.searchParams.set('z', url.searchParams.get('z') ?? '16');
      } else {
        // An organisation page carries no question a frame can be asked, but the address the
        // institute is written at does — the anchor beside the frame still points at that page.
        return byAddress(address);
      }
      return widget.toString();
    }

    return url.toString();
  }

  // No link of its own: the address the institute is written at is enough to ask a map for.
  return byAddress(address);
}

/** The same link, for an ordinary anchor that opens the map in a new tab. */
export function safeMapLink(link: string): string | null {
  return parsed(link)?.toString() ?? null;
}
