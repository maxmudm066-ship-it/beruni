import type { TranslationKey } from '@/lib/admin/labels';

/**
 * Menu Manager actions never render a screen of their own: they save and come back here with one
 * query parameter. This map turns that parameter into the sentence the person sees.
 */
export const MENU_NOTICES: Record<string, TranslationKey> = {
  created: 'menu.created',
  'menu-saved': 'menu.menuSaved',
  'menu-deleted': 'menu.deleted',
  'item-saved': 'menu.itemSaved',
  'item-created': 'menu.itemCreated',
  'item-deleted': 'menu.itemDeleted',
  'material-linked': 'menu.materialLinked',
  'material-unlinked': 'menu.materialUnlinked',
  order: 'order.saved',
  'order-invalid': 'order.failed',
  'too-deep': 'menu.tooDeep',
  'bad-parent': 'menu.badParent',
  'bad-url': 'menu.badUrl',
  'no-title': 'menu.titleRequired',
  'no-material': 'menu.noMaterials',
  denied: 'bulk.denied',
  invalid: 'form.requiredField',
  missing: 'menu.notFound',
};
