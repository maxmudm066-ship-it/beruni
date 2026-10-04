import type { TranslationKey } from '@/lib/admin/labels';

/**
 * The SEO-by-address screen saves through a plain form post and comes back here with one query
 * parameter, so it works with JavaScript turned off. `bad` carries a validation problem named in
 * `seo-address.ts`.
 */
export const SEO_NOTICES: Record<string, TranslationKey> = {
  created: 'seo.created',
  saved: 'seo.saved',
  deleted: 'seo.deleted',
  exists: 'seo.exists',
  missing: 'seo.notFound',
  denied: 'seo.denied',
};
