/**
 * The name of the cookie that remembers which language a visitor picked.
 *
 * Its own module because all three halves of the site touch it: a click in the switcher writes it
 * from the browser, the proxy writes it while prefixing an address, and `/` reads both on the
 * server. The value is always one of the language codes the panel has activated, so there is
 * nothing to trust or escape in it.
 */
export const SITE_LOCALE_COOKIE = 'beruni_site_locale';

/**
 * How long a language pick is remembered. A year, so that returning visitors keep the site in the
 * language they chose; the panel can deactivate a language sooner than that, which is why the value
 * is re-checked against the live list wherever it is read.
 */
export const SITE_LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
