import type { TranslationKey } from '@/lib/admin/labels';

/**
 * Redirect Manager actions save and come back here with one query parameter, so the screen keeps
 * working as a plain form post. `bad` carries a validation problem named in `redirect-path.ts`.
 */
export const REDIRECT_NOTICES: Record<string, TranslationKey> = {
  created: 'redirects.created',
  saved: 'redirects.saved',
  deleted: 'redirects.deleted',
  state: 'redirects.stateSaved',
  exists: 'redirects.exists',
  missing: 'redirects.notFound',
  denied: 'redirects.denied',
};
