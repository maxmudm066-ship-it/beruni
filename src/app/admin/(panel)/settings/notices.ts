import type { TranslationKey } from '@/lib/admin/labels';

/**
 * Settings actions save and come back to the same screen with one or two query parameters. This map
 * turns the parameter into the sentence the person sees; `bad` is decoded separately because it
 * names which fields were refused.
 */
export const SETTINGS_NOTICES: Record<string, TranslationKey> = {
  saved: 'settings.saved',
  partial: 'settings.partialSaved',
  failed: 'settings.nothingSaved',
  denied: 'bulk.denied',
};
