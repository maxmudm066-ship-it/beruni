import type { TranslationKey } from '@/lib/admin/labels';

/**
 * The Import / Export screen posts plain forms and comes back with one query parameter, so it works
 * with JavaScript turned off. `bad` names a file the panel could not read at all.
 */
export const IMPORT_NOTICES: Record<string, TranslationKey> = {
  checked: 'importExport.checked',
  imported: 'importExport.imported',
  cancelled: 'importExport.cancelled',
  missing: 'importExport.notFound',
  notReady: 'importExport.notReady',
  denied: 'importExport.denied',
};

export const IMPORT_PROBLEMS: Record<string, TranslationKey> = {
  emptyFile: 'importExport.failEmptyFile',
  noData: 'importExport.failNoData',
  noColumns: 'importExport.failNoColumns',
  tooManyRows: 'importExport.failTooManyRows',
  tooLarge: 'importExport.failTooLarge',
  badType: 'importExport.failBadType',
};
