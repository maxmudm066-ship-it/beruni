/**
 * Turning a stored path into an address a visitor can follow.
 *
 * The panel stores internal targets without a language prefix (`/about`), because a content manager
 * should not have to maintain three copies of the same link. Every public link therefore gets the
 * prefix of the page it is shown on added here — once, so menus, homepage buttons and listings agree.
 */

/** `//example.com` would leave the site while still looking internal, so it is refused. */
export function internalHref(path: string, lang: string): string | null {
  const value = path.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value === '/' || value === '') return `/${lang}`;
  if (value.startsWith(`/${lang}/`) || value === `/${lang}` || value.startsWith(`/${lang}?`) || value.startsWith(`/${lang}#`)) {
    return value;
  }
  return `/${lang}${value}`;
}

/** Only http(s) leaves the site; anything that could run a script is dropped. */
export function externalHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
