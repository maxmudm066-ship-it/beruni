import 'server-only';
import { CONTENT_TYPES } from '@/lib/content-types';

/** Content types the subject may act on, i.e. holds at least one of `<type>.<action>` for. */
export function typeKeysFor(permissions: string[], actions: readonly string[]): string[] {
  if (permissions.includes('*')) return CONTENT_TYPES.map((type) => type.key);
  return CONTENT_TYPES.filter((type) => actions.some((action) => permissions.includes(`${type.key}.${action}`))).map((type) => type.key);
}

/** Search, status and type filters plus page of the queue screens (Trash, Review). */
export interface QueueFilters {
  q: string;
  type: string;
  status: string;
  page: number;
}

export const QUEUE_STATUS_VALUES = ['in_review', 'approved', 'scheduled'] as const;
export type QueueStatus = (typeof QUEUE_STATUS_VALUES)[number];

export function parseQueueFilters(searchParams: Record<string, string | string[] | undefined>): QueueFilters {
  const text = (key: string) => {
    const value = searchParams[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const page = Number.parseInt(text('page'), 10);
  const status = text('status');
  return {
    q: text('q'),
    type: text('type').slice(0, 40),
    // Empty means "no status chosen yet": the Trash screen needs no status, the review queue defaults itself.
    status: (QUEUE_STATUS_VALUES as readonly string[]).includes(status) ? status : '',
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function queueQuery(filters: QueueFilters, overrides: Partial<QueueFilters>): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.type) params.set('type', merged.type);
  if (merged.status) params.set('status', merged.status);
  if (merged.page > 1) params.set('page', String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Filters of the Translations screen: which material, of which type, missing which language. */
export interface TranslationsFilters {
  q: string;
  type: string;
  lang: string;
  group: string;
  page: number;
}

/** `langs` is the list of active language codes, so a hand-edited URL cannot smuggle a filter in. */
export function parseTranslationsFilters(
  searchParams: Record<string, string | string[] | undefined>,
  langs: string[],
  types: string[],
): TranslationsFilters {
  const text = (key: string) => {
    const value = searchParams[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const page = Number.parseInt(text('page'), 10);
  const lang = text('lang');
  const type = text('type').slice(0, 40);
  return {
    q: text('q').slice(0, 120),
    type: types.includes(type) ? type : '',
    lang: langs.includes(lang) ? lang : '',
    group: text('group').slice(0, 40),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function translationsQuery(filters: TranslationsFilters, overrides: Partial<TranslationsFilters>): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', merged.q);
  if (merged.type) params.set('type', merged.type);
  if (merged.lang) params.set('lang', merged.lang);
  if (merged.group) params.set('group', merged.group);
  if (merged.page > 1) params.set('page', String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}
