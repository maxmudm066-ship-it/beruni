import type { TranslationKey } from './labels';

export const REDIRECT_SOURCE_MAX = 500;
export const REDIRECT_TARGET_MAX = 1000;
export const REDIRECT_NOTE_MAX = 200;

export const REDIRECT_TYPES = ['permanent', 'temporary'] as const;
export type RedirectType = (typeof REDIRECT_TYPES)[number];

export type RedirectProblem = 'emptySource' | 'badSource' | 'emptyTarget' | 'badTarget' | 'samePath';

export const REDIRECT_PROBLEM_KEYS: Record<RedirectProblem, TranslationKey> = {
  emptySource: 'redirects.problemEmptySource',
  badSource: 'redirects.problemBadSource',
  emptyTarget: 'redirects.problemEmptyTarget',
  badTarget: 'redirects.problemBadTarget',
  samePath: 'redirects.problemSamePath',
};

export const REDIRECT_ORIGIN_KEYS: Record<string, TranslationKey> = {
  manual: 'redirects.originManual',
  slug_change: 'redirects.originSlugChange',
  migration: 'redirects.originMigration',
};

/** A `?bad=` parameter may be typed by anyone, so it is checked before it names a message. */
export function isRedirectProblem(value: string): value is RedirectProblem {
  return value in REDIRECT_PROBLEM_KEYS;
}

const ABSOLUTE_URL = /^https?:\/\//i;

/** Typed text that can still be an address: no inner spaces, no backslashes, nothing empty. */
function cleaned(raw: string): string {
  return raw.trim();
}

function dropTrailingSlash(value: string): string {
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

/** Staff routinely type `news/old` — a bare path is read as a path of this site. */
function withLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

/**
 * The old address. Always a path on this site — a redirect record cannot start from another
 * domain. `..` and `//host` are refused because both have been used to walk out of the site.
 */
export function normalizeSource(raw: string): string | null {
  const value = cleaned(raw);
  if (!value || /\s|\\/.test(value)) return null;
  if (ABSOLUTE_URL.test(value) || value.startsWith('//')) return null;
  if (value.includes('..')) return null;
  return dropTrailingSlash(withLeadingSlash(value));
}

/**
 * The new address: a path on this site, or a full http(s) link when the material really moved to
 * another institution. A protocol-relative `//example.com` and a `javascript:` address are both
 * refused, so a saved target can never be an unexpected jump off the site.
 */
export function normalizeTarget(raw: string): string | null {
  const value = cleaned(raw);
  if (!value || /\s|\\/.test(value)) return null;
  if (value.startsWith('//') || value.includes('..')) return null;
  if (ABSOLUTE_URL.test(value)) return /^https?:\/\/[^.]/i.test(value) ? value : null;
  return dropTrailingSlash(withLeadingSlash(value));
}

export function redirectType(raw: string | null): RedirectType {
  return REDIRECT_TYPES.includes(raw as RedirectType) ? (raw as RedirectType) : 'permanent';
}

/** Both addresses at once, so the pair can still be compared before anything is stored. */
export function readRedirectPaths(
  source: string,
  target: string,
): { ok: true; sourcePath: string; targetPath: string } | { ok: false; problem: RedirectProblem } {
  const from = normalizeSource(source);
  if (from === null) return { ok: false, problem: cleaned(source) ? 'badSource' : 'emptySource' };
  const to = normalizeTarget(target);
  if (to === null) return { ok: false, problem: cleaned(target) ? 'badTarget' : 'emptyTarget' };
  if (from.toLowerCase() === to.toLowerCase()) return { ok: false, problem: 'samePath' };
  return { ok: true, sourcePath: from, targetPath: to };
}
