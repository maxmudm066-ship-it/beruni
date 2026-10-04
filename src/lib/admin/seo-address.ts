import type { TranslationKey } from './labels';
import { normalizeSource, normalizeTarget } from './redirect-path';

export const SEO_PATH_MAX = 500;
export const SEO_TITLE_MAX = 200;
export const SEO_DESCRIPTION_MAX = 500;
export const SEO_KEYWORDS_MAX = 300;
export const SEO_CANONICAL_MAX = 1000;

export type SeoProblem = 'emptyPath' | 'badPath' | 'badCanonical' | 'unknownLanguage' | 'badImage';

export const SEO_PROBLEM_KEYS: Record<SeoProblem, TranslationKey> = {
  emptyPath: 'seo.problemEmptyPath',
  badPath: 'seo.problemBadPath',
  badCanonical: 'seo.problemBadCanonical',
  unknownLanguage: 'seo.problemUnknownLanguage',
  badImage: 'seo.problemBadImage',
};

/** A `?bad=` parameter may be typed by anyone, so it is checked before it names a message. */
export function isSeoProblem(value: string): value is SeoProblem {
  return value in SEO_PROBLEM_KEYS;
}

/**
 * The address whose SEO is being set. Always a path of this site — the same rules the Redirect
 * Manager uses for an old address, because it is the same kind of thing a person types.
 */
export function readRouteAddress(raw: string): { ok: true; path: string } | { ok: false; problem: SeoProblem } {
  const value = raw.trim();
  const path = normalizeSource(value.slice(0, SEO_PATH_MAX));
  if (path === null) return { ok: false, problem: value ? 'badPath' : 'emptyPath' };
  return { ok: true, path };
}

/**
 * The address a search engine should treat as the main one. Empty means the page's own address,
 * which is what almost every page wants.
 */
export function readCanonical(raw: string): { ok: true; value: string | null } | { ok: false; problem: SeoProblem } {
  const value = raw.trim().slice(0, SEO_CANONICAL_MAX);
  if (!value) return { ok: true, value: null };
  const target = normalizeTarget(value);
  if (target === null) return { ok: false, problem: 'badCanonical' };
  return { ok: true, value: target };
}
