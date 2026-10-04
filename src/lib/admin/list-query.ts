import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS_VALUES } from '@/lib/enums';
import type { ContentTypeDef } from '@/lib/content-types';

export const PAGE_SIZE = 25;

/** Bulk operations offered above every material list; the value is also the label key `bulk.<value>`. */
export const BULK_ACTIONS = ['publish', 'unpublish', 'archive', 'moveCategory', 'addTag', 'trash'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export function isBulkAction(value: string): value is BulkAction {
  return (BULK_ACTIONS as readonly string[]).includes(value);
}

/** Extra permission each bulk action needs on top of `<type>.view`. */
export const BULK_PERMISSION: Record<BulkAction, string> = {
  publish: 'publish',
  unpublish: 'edit',
  archive: 'edit',
  moveCategory: 'edit',
  addTag: 'edit',
  trash: 'delete',
};

export const BULK_STATUS: Partial<Record<BulkAction, string>> = { publish: 'published', unpublish: 'draft', archive: 'archived' };
export const BULK_LIMIT = 200;

export interface ListFilters {
  q: string;
  status: string;
  lang: string;
  categoryId: string;
  sort: SortKey;
  page: number;
}

const SORTS = {
  updated: [{ updatedAt: 'desc' }],
  created: [{ createdAt: 'desc' }],
  title: [{ title: 'asc' }],
  published: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
  status: [{ status: 'asc' }, { updatedAt: 'desc' }],
} satisfies Record<string, Prisma.ContentItemOrderByWithRelationInput[]>;

export type SortKey = keyof typeof SORTS;
export const SORT_KEYS = Object.keys(SORTS) as SortKey[];

export function hasCategoryField(def: ContentTypeDef): boolean {
  return Boolean(def.detailModel && def.categoryScope && def.fields.some((field) => field.kind === 'category'));
}

/** Reads the raw query string of the list page; anything unexpected falls back to the default view. */
export function parseFilters(searchParams: Record<string, string | string[] | undefined>, firstSort: SortKey = 'updated'): ListFilters {
  const text = (key: string) => {
    const value = searchParams[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const status = text('status');
  const sort = text('sort');
  const page = Number.parseInt(text('page'), 10);

  return {
    q: text('q'),
    status: CONTENT_STATUS_VALUES.includes(status as (typeof CONTENT_STATUS_VALUES)[number]) ? status : '',
    lang: text('lang').slice(0, 8),
    categoryId: text('categoryId').slice(0, 40),
    sort: (SORT_KEYS as string[]).includes(sort) ? (sort as SortKey) : firstSort,
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function orderByFor(sort: SortKey): Prisma.ContentItemOrderByWithRelationInput[] {
  return SORTS[sort];
}

/** Group ids of the type's own detail table, used to filter or search by category. */
async function groupsWithCategory(def: ContentTypeDef, where: Record<string, unknown>): Promise<string[]> {
  if (!def.detailModel) return [];
  const delegate = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<{ groupId: string }[]> }>)[def.detailModel];
  const rows = await delegate.findMany({ where, select: { groupId: true } });
  return rows.map((row) => row.groupId);
}

async function categoryIdsByName(scope: string, name: string): Promise<string[]> {
  const variants = caseVariants(name);
  const rows = await prisma.category.findMany({
    where: {
      scope,
      OR: variants.flatMap((value) => [{ translations: { some: { name: { contains: value } } } }, { slug: { contains: value } }]),
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * SQLite compares LIKE case-sensitively outside ASCII, so a Russian search word typed in
 * lowercase would miss every record that starts with a capital letter. Postgres behaves the
 * same without `mode: 'insensitive'`, which SQLite does not support, so the visible
 * capitalisation variants are searched instead.
 */
export function caseVariants(value: string): string[] {
  const first = value.charAt(0);
  return [...new Set([value, first.toUpperCase() + value.slice(1), first.toLowerCase() + value.slice(1)])];
}

function textMatch(build: (value: string) => Prisma.ContentItemWhereInput, value: string): Prisma.ContentItemWhereInput {
  const variants = caseVariants(value);
  return variants.length === 1 ? build(value) : { OR: variants.map(build) };
}

/**
 * Free-text conditions shared by every admin listing: title, subtitle, slug, excerpt, body text,
 * keywords, credited author, who last touched the material, tags, group authors and a literal
 * material or group id. Category names need the type's detail table and are added by the caller.
 */
export function textSearchOr(q: string): Prisma.ContentItemWhereInput[] {
  return [
    textMatch((value) => ({ title: { contains: value } }), q),
    textMatch((value) => ({ subtitle: { contains: value } }), q),
    textMatch((value) => ({ slug: { contains: value } }), q),
    textMatch((value) => ({ excerpt: { contains: value } }), q),
    textMatch((value) => ({ body: { contains: value } }), q),
    textMatch((value) => ({ keywords: { contains: value } }), q),
    textMatch((value) => ({ author: { displayName: { contains: value } } }), q),
    textMatch((value) => ({ updatedBy: { displayName: { contains: value } } }), q),
    textMatch((value) => ({ tags: { some: { tag: { translations: { some: { name: { contains: value } } } } } } }), q),
    textMatch((value) => ({ group: { authorships: { some: { fullName: { contains: value } } } } }), q),
    { id: q },
    { groupId: q },
    // The list prints only the tail of an id, so what a staff member can see has to be searchable.
    ...(q.length >= 6 && /^[0-9a-z]+$/.test(q) ? [{ id: { endsWith: q } }, { groupId: { endsWith: q } }] : []),
  ];
}

/**
 * One WHERE clause for the whole list: title, subtitle, slug, excerpt, body text, keywords,
 * tags, the credited author, the category name and a literal material id or group id.
 */
export async function buildListWhere(def: ContentTypeDef, filters: ListFilters): Promise<Prisma.ContentItemWhereInput> {
  const where: Prisma.ContentItemWhereInput = {
    deletedAt: null,
    group: { type: def.key, deletedAt: null },
  };
  const and: Prisma.ContentItemWhereInput[] = [];

  if (filters.status) where.status = filters.status;
  if (filters.lang) where.lang = filters.lang;

  if (filters.categoryId && hasCategoryField(def)) {
    and.push({ groupId: { in: await groupsWithCategory(def, { categoryId: filters.categoryId }) } });
  }

  const q = filters.q;
  if (q) {
    const or = textSearchOr(q);

    if (hasCategoryField(def) && def.categoryScope) {
      const categoryIds = await categoryIdsByName(def.categoryScope, q);
      if (categoryIds.length) or.push({ groupId: { in: await groupsWithCategory(def, { categoryId: { in: categoryIds } }) } });
    }

    and.push({ OR: or });
  }

  if (and.length) where.AND = and;
  return where;
}

/** Languages that actually occur in this type, so the filter never offers empty choices. */
export async function languagesInUse(def: ContentTypeDef): Promise<string[]> {
  const rows = await prisma.contentItem.groupBy({
    by: ['lang'],
    where: { deletedAt: null, group: { type: def.key, deletedAt: null } },
  });
  return rows.map((row) => row.lang).sort();
}

/** Category name per group, read from the type's own detail table. */
export async function categoriesForGroups(
  def: ContentTypeDef,
  groupIds: string[],
  lang: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!hasCategoryField(def) || !def.detailModel || !groupIds.length) return names;

  const delegate = (prisma as unknown as Record<string, { findMany(args: unknown): Promise<{ groupId: string; categoryId: string | null }[]> }>)[
    def.detailModel
  ];
  const rows = await delegate.findMany({ where: { groupId: { in: groupIds } }, select: { groupId: true, categoryId: true } });
  const categoryIds = rows.map((row) => row.categoryId).filter((id): id is string => Boolean(id));
  if (!categoryIds.length) return names;

  const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } }, include: { translations: true } });
  const byId = new Map(
    categories.map((category) => [
      category.id,
      category.translations.find((entry) => entry.lang === lang)?.name ?? category.translations[0]?.name ?? category.slug,
    ]),
  );
  for (const row of rows) {
    const name = row.categoryId ? byId.get(row.categoryId) : undefined;
    if (name) names.set(row.groupId, name);
  }
  return names;
}

/** Builds the query string a list page link should carry, keeping the current filters. */
export function listQuery(filters: ListFilters, overrides: Partial<Record<keyof ListFilters, string | number>>): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set('q', String(merged.q));
  if (merged.status) params.set('status', String(merged.status));
  if (merged.lang) params.set('lang', String(merged.lang));
  if (merged.categoryId) params.set('categoryId', String(merged.categoryId));
  if (merged.sort && merged.sort !== 'updated') params.set('sort', String(merged.sort));
  if (Number(merged.page) > 1) params.set('page', String(merged.page));
  const query = params.toString();
  return query ? `?${query}` : '';
}
