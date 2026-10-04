import type { TranslationKey } from '@/lib/admin/labels';

/** Query parameter an action returns with, mapped to the sentence the person sees. */
export const HOME_NOTICES: Record<string, TranslationKey> = {
  created: 'home.created',
  saved: 'home.saved',
  deleted: 'home.deleted',
  order: 'order.saved',
  'order-invalid': 'order.failed',
  'bad-url': 'home.badUrl',
  denied: 'bulk.denied',
  invalid: 'form.requiredField',
  missing: 'home.notFound',
};
