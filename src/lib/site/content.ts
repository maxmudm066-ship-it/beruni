/**
 * Section listings and material pages of the public site.
 *
 * One reader serves every content type: the registry (`../content-types`) says which fields a type
 * has, and this module turns their stored values into labelled, dated, linked text in the language of
 * the page. Nothing unpublished, deleted or past its expiry date can be reached — every query states
 * it — which is what the panel promises its users.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS } from '@/lib/enums';
import { localizedPath } from '@/lib/content/routes';
import {
  CONTENT_TYPE_MAP,
  DETAIL_KEY_BY_TYPE,
  MEDIA_FIELD_ROLE,
  type ContentTypeDef,
  type FieldDef,
} from '@/lib/content-types';
import { sanitizeContentHtml } from '@/lib/content/html';
import { fieldLabel, optionLabel } from '@/lib/admin/field-labels';
import { formatDate, formatDateTime } from '@/lib/admin/format';
import type { AdminLocale } from '@/lib/admin/labels';
import { sectionName } from '@/lib/site/dictionary';
import { listingSpecFor, type ListingSpec, type ListFilter } from '@/lib/site/routing';
import { listingCards, type PublicImage, type PublicMaterial } from '@/lib/site/materials';

export const PER_PAGE = 12;

export interface FilterOption {
  value: string;
  label: string;
  href: string;
}

export interface Listing {
  typeKey: string;
  heading: string;
  baseHref: string;
  items: PublicMaterial[];
  total: number;
  page: number;
  pages: number;
  categories: FilterOption[];
  kinds: FilterOption[];
  query: string;
  activeCategory: string;
  activeKind: string;
  activeTag: string;
}

export interface ListingParams {
  category?: string | null;
  kind?: string | null;
  tag?: string | null;
  q?: string | null;
  page?: string | null;
}

/** Stored values a visitor has no business seeing, whatever a type keeps in them. */
const PRIVATE_FIELDS = new Set([
  'title',
  'subtitle',
  'slug',
  'lang',
  'excerpt',
  'body',
  'status',
  'seoTitle',
  'seoDescription',
  'keywords',
  'canonicalUrl',
  'ogTitle',
  'ogDescription',
  'ogImage',
  'noIndex',
  'isFeatured',
  'template',
  'pathOverride',
  'showInBreadcrumbs',
  'sortOrder',
]);

/** The detail relation that holds the rubric of each type that has one. */
const CATEGORY_DETAIL: Record<string, string> = {
  news: 'news',
  article: 'article',
  book: 'book',
  publication: 'publication',
  manuscript: 'manuscript',
  event: 'event',
  announcement: 'announcement',
  document: 'document',
  partner: 'partner',
  research_project: 'researchProject',
};

/**
 * How a section is ordered. Type-specific columns live on the detail row of the group, so the order
 * has to walk through `group` to reach them.
 */
const ORDER_BY: Record<string, unknown[]> = {
  event: [{ group: { event: { startDate: 'desc' } } }, { publishedAt: 'desc' }],
  researcher: [{ title: 'asc' }],
  department: [{ group: { department: { sortOrder: 'asc' } } }, { title: 'asc' }],
  partner: [{ group: { partner: { country: 'asc' } } }, { title: 'asc' }],
  dissertation: [{ group: { dissertation: { defenseDate: 'desc' } } }],
  manuscript: [{ group: { manuscript: { repositoryId: 'asc' } } }],
};

function localeOf(lang: string): AdminLocale {
  return lang === 'uz' || lang === 'en' || lang === 'ru' ? lang : 'ru';
}

function detailKeyOf(typeKey: string): string | null {
  return DETAIL_KEY_BY_TYPE[typeKey as keyof typeof DETAIL_KEY_BY_TYPE] ?? null;
}

function pathOf(typeKey: string, slug: string, pathOverride: string | null, lang: string): string {
  return localizedPath({ typeKey, slug, pathOverride }, lang);
}

/** The address of a listing with some of its filters switched on. */
export function sectionHref(baseHref: string, values: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const text = value === null || value === undefined ? '' : String(value).trim();
    if (text && !(key === 'page' && text === '1')) search.set(key, text);
  }
  const line = search.toString();
  return line ? `${baseHref}?${line}` : baseHref;
}

/**
 * SQLite folds the case of ASCII letters only, so a Russian or Uzbek word typed with a capital
 * initial would miss the same word written in lower case inside a sentence. Both shapes are looked
 * for, which is what a visitor expects from a search box.
 */
function searchVariants(query: string): string[] {
  const lower = query.toLowerCase();
  const capitalised = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([query, lower, capitalised, query.toUpperCase()])];
}

/**
 * The rows a section shows: published, in this language, honouring the filter the address fixed and
 * whatever the visitor picked. An announcement past its 'valid until' moment drops out by itself.
 */
function listingWhere(typeKey: string, lang: string, filter: ListFilter, params: ListingParams, now: Date): Record<string, unknown> {
  const detailKey = detailKeyOf(typeKey);
  const detail: Record<string, unknown> = {};

  const kind = filter.kind ?? params.kind ?? undefined;
  if (kind) detail.kind = kind;
  if (filter.youngOnly) detail.isYoungScientist = true;
  if (filter.hasDigitalCopy) detail.hasDigitalCopy = true;
  if (filter.leadership) detail.NOT = { leadershipRole: 'none' };
  if (params.category && CATEGORY_DETAIL[typeKey]) detail.category = { slug: params.category };

  const query = (params.q ?? '').trim().slice(0, 120);
  const search = query
    ? { OR: searchVariants(query).flatMap((variant) => [{ title: { contains: variant } }, { excerpt: { contains: variant } }]) }
    : {};
  return {
    lang,
    status: CONTENT_STATUS.PUBLISHED,
    deletedAt: null,
    group: {
      type: typeKey,
      deletedAt: null,
      ...(detailKey && Object.keys(detail).length ? { [detailKey]: detail } : {}),
      // Written as what must not be true, because an announcement whose details were never filled in
      // has no expiry to pass and belongs on the page all the same.
      ...(typeKey === 'announcement' ? { NOT: { announcement: { expiresAt: { lt: now } } } } : {}),
    },
    ...search,
    ...(params.tag ? { tags: { some: { tag: { slug: params.tag } } } } : {}),
  };
}

async function buildChips(
  def: ContentTypeDef,
  spec: ListingSpec,
  lang: string,
  baseHref: string,
  params: ListingParams,
): Promise<{ categories: FilterOption[]; kinds: FilterOption[] }> {
  const locale = localeOf(lang);

  const categories: FilterOption[] = def.categoryScope && CATEGORY_DETAIL[spec.typeKey]
    ? (
        await prisma.category.findMany({
          where: { scope: def.categoryScope, isActive: true },
          include: { translations: true },
          orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        })
      ).map((row) => ({
        value: row.slug,
        label: row.translations.find((entry) => entry.lang === lang)?.name ?? row.translations[0]?.name ?? row.slug,
        href: sectionHref(baseHref, { category: row.slug, kind: params.kind, q: params.q }),
      }))
    : [];

  const field = spec.filter.kind ? undefined : def.fields.find((entry) => entry.name === 'kind' && entry.kind === 'select');
  const kinds: FilterOption[] = (field?.options ?? []).map((option) => ({
    value: option.value,
    label: optionLabel(locale, option.value, option.label),
    href: sectionHref(baseHref, { kind: option.value, category: params.category, q: params.q }),
  }));

  return { categories, kinds };
}

/** One page of a section, with everything the page needs to draw its filters and pagination. */
export async function buildListing(spec: ListingSpec, lang: string, params: ListingParams): Promise<Listing> {
  const def = CONTENT_TYPE_MAP.get(spec.typeKey);
  if (!def) throw new Error(`no content type ${spec.typeKey}`);

  const baseHref = `/${lang}/${spec.path}`;
  const query = (params.q ?? '').trim().slice(0, 120);
  const requested = Math.max(1, Math.floor(Number(params.page ?? '1')) || 1);

  const where = listingWhere(spec.typeKey, lang, spec.filter, params, new Date());

  // The count comes first: an address asking for a page past the end has to show the last page, not
  // an empty one, so the offset cannot be decided before the total is known.
  const total = await prisma.contentItem.count({ where: where as never });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(requested, pages);

  const [items, chips] = await Promise.all([
    listingCards(spec.typeKey, lang, where, ORDER_BY[spec.typeKey] ?? [{ publishedAt: 'desc' }, { createdAt: 'desc' }], PER_PAGE, (page - 1) * PER_PAGE),
    buildChips(def, spec, lang, baseHref, params),
  ]);

  return {
    typeKey: spec.typeKey,
    heading: sectionName(lang, spec.title, spec.typeKey),
    baseHref,
    items,
    total,
    page,
    pages,
    categories: chips.categories,
    kinds: chips.kinds,
    query,
    activeCategory: params.category ?? '',
    activeKind: params.kind ?? '',
    activeTag: params.tag ?? '',
  };
}

export interface PublicFact {
  label: string;
  value: string;
  href: string;
  long: boolean;
}

export interface PublicMediaGroup {
  label: string;
  images: { url: string; alt: string; caption: string }[];
  files: { name: string; href: string; size: number }[];
  links: { title: string; href: string }[];
}

export interface PublicPeopleGroup {
  label: string;
  rows: { name: string; note: string; href: string }[];
}

export interface PublicLinkGroup {
  label: string;
  rows: { title: string; href: string }[];
}

export interface PublicPage {
  itemId: string;
  groupId: string;
  typeKey: string;
  lang: string;
  title: string;
  subtitle: string;
  excerpt: string;
  body: string;
  href: string;
  publishedAt: Date | null;
  category: { name: string; slug: string } | null;
  tags: { name: string; slug: string }[];
  hero: PublicImage | null;
  facts: PublicFact[];
  sections: { label: string; html: string }[];
  mediaGroups: PublicMediaGroup[];
  people: PublicPeopleGroup[];
  links: PublicLinkGroup[];
  others: { lang: string; href: string }[];
  listHref: string;
  listTitle: string;
  seo: {
    title: string;
    description: string;
    keywords: string;
    canonical: string;
    ogTitle: string;
    ogDescription: string;
    ogImage: string;
    noIndex: boolean;
  };
}

type Row = Record<string, unknown>;

function trimmed(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function safeHref(value: string): string {
  return /^https?:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value) ? value : '';
}

/** A stored value the way a visitor should read it: dates in the language of the page, ticks for switches. */
function formatFact(field: FieldDef, value: unknown, lang: string): { value: string; href: string; long: boolean } {
  if (value === null || value === undefined || value === '') return { value: '', href: '', long: false };
  if (field.kind === 'checkbox') return { value: value ? '✓' : '', href: '', long: false };
  if (value instanceof Date) {
    return { value: field.kind === 'datetime' ? formatDateTime(value, lang) : formatDate(value, lang), href: '', long: false };
  }
  if (field.kind === 'select') {
    const option = field.options?.find((entry) => entry.value === String(value));
    return { value: optionLabel(localeOf(lang), String(value), option?.label ?? String(value)), href: '', long: false };
  }
  if (field.kind === 'url') {
    const raw = String(value).trim();
    return { value: raw.replace(/^https?:\/\//, ''), href: safeHref(raw), long: false };
  }
  const text = String(value).trim();
  return { value: text, href: '', long: field.kind === 'textarea' || text.length > 90 };
}

/** The `Название | https://example.com` lines a person pastes into a links box. */
function parsedLinks(value: unknown): { title: string; href: string }[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split('|');
      const href = safeHref(trimmed(url ?? label));
      return { title: trimmed(url ? label : url) || trimmed(href), href };
    })
    .filter((row) => row.title && row.href);
}

function factFields(def: ContentTypeDef): FieldDef[] {
  return def.fields.filter(
    (field) =>
      !PRIVATE_FIELDS.has(field.name) &&
      !MEDIA_FIELD_ROLE[field.name] &&
      field.kind !== 'richtext' &&
      field.kind !== 'contentRef' &&
      field.kind !== 'people' &&
      field.kind !== 'authors' &&
      field.kind !== 'json' &&
      field.kind !== 'tags' &&
      field.kind !== 'category' &&
      field.name !== 'author' &&
      field.name !== 'publishedAt',
  );
}

/**
 * Public addresses of materials of one type, by their detail row id.
 * A referenced material in another language is used when this one has not been translated, because a
 * broken link in a bibliography is worse than a link in a foreign language.
 */
async function pagesByDetailId(typeKey: string, ids: string[], lang: string): Promise<Map<string, { title: string; href: string }>> {
  const out = new Map<string, { title: string; href: string }>();
  if (!ids.length) return out;

  const detailKey = detailKeyOf(typeKey);
  const model = detailKey ? (prisma as unknown as Record<string, { findMany: (args: Row) => Promise<{ id: string; groupId: string | null }[]> }>)[detailKey] : undefined;
  if (!model) return out;

  const details = await model.findMany({ where: { id: { in: ids } }, select: { id: true, groupId: true } });
  const groupIds = details.map((row) => row.groupId).filter((id): id is string => Boolean(id));
  if (!groupIds.length) return out;

  const items = await prisma.contentItem.findMany({
    where: { groupId: { in: groupIds }, status: CONTENT_STATUS.PUBLISHED, deletedAt: null },
    select: { groupId: true, lang: true, title: true, slug: true, group: { select: { type: true, page: { select: { pathOverride: true } } } } },
  });

  const byGroup = new Map<string, { title: string; href: string }>();
  for (const item of items) {
    if (byGroup.has(item.groupId) && item.lang !== lang) continue;
    byGroup.set(item.groupId, {
      title: item.title,
      href: pathOf(item.group.type, item.slug, item.group.page?.pathOverride ?? null, item.lang),
    });
  }

  for (const row of details) {
    const page = row.groupId ? byGroup.get(row.groupId) : undefined;
    if (page) out.set(row.id, page);
  }
  return out;
}

async function pagesByGroupId(groupIds: string[], lang: string): Promise<Map<string, { title: string; href: string }>> {
  const out = new Map<string, { title: string; href: string }>();
  if (!groupIds.length) return out;

  const items = await prisma.contentItem.findMany({
    where: { groupId: { in: groupIds }, status: CONTENT_STATUS.PUBLISHED, deletedAt: null },
    select: { groupId: true, lang: true, title: true, slug: true, group: { select: { type: true, page: { select: { pathOverride: true } } } } },
  });
  for (const item of items) {
    if (out.has(item.groupId) && item.lang !== lang) continue;
    out.set(item.groupId, { title: item.title, href: pathOf(item.group.type, item.slug, item.group.page?.pathOverride ?? null, item.lang) });
  }
  return out;
}

const HERO_FIELDS = new Set(['mainImage', 'cover', 'photo', 'logo']);

async function loadMedia(groupId: string, def: ContentTypeDef, lang: string): Promise<{ hero: PublicImage | null; groups: PublicMediaGroup[] }> {
  const fieldByRole = new Map<string, FieldDef>();
  for (const field of def.fields) {
    const role = MEDIA_FIELD_ROLE[field.name];
    if (role && !fieldByRole.has(role)) fieldByRole.set(role, field);
  }

  const links = await prisma.mediaLink.findMany({
    where: { groupId },
    include: { media: { include: { variants: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  const rows = links
    .filter((link) => link.media.status === 'ready')
    .map((link) => {
      const field = fieldByRole.get(link.role);
      const media = link.media;
      const wide = media.variants.find((variant) => variant.role === 'large') ?? media.variants.find((variant) => variant.role === 'medium');
      return {
        field: field?.name ?? '',
        label: field ? fieldLabel(localeOf(lang), field.name, field.label) : '',
        isImage: media.kind === 'image',
        assetKind: media.kind,
        url: media.kind === 'image' ? (wide?.publicUrl ?? media.publicUrl) : '',
        alt: trimmed(link.caption ?? media.altText ?? media.title),
        caption: trimmed(link.caption ?? ''),
        name: trimmed(media.originalName || media.title || media.filename),
        href: safeHref(media.externalUrl ?? media.publicUrl),
        size: media.sizeBytes,
      };
    })
    .filter((row) => row.field && row.field !== 'ogImage');

  let hero: PublicImage | null = null;
  const firstPicture = rows.find((row) => HERO_FIELDS.has(row.field) && (row.url || row.href));
  if (firstPicture) hero = { url: firstPicture.url || firstPicture.href, alt: firstPicture.alt || firstPicture.name };

  const groups: PublicMediaGroup[] = [];
  for (const field of def.fields) {
    if (!MEDIA_FIELD_ROLE[field.name] || field.name === 'ogImage') continue;
    if (HERO_FIELDS.has(field.name)) continue;
    const items = rows.filter((row) => row.field === field.name);
    if (!items.length) continue;

    const label = fieldLabel(localeOf(lang), field.name, field.label);
    if (field.name === 'gallery') {
      groups.push({
        label,
        images: items.map((row) => ({ url: row.url || row.href, alt: row.alt, caption: row.caption })),
        files: [],
        links: [],
      });
      continue;
    }
    groups.push({
      label,
      images: items.filter((row) => row.isImage).map((row) => ({ url: row.url, alt: row.alt, caption: row.caption })),
      files: items.filter((row) => !row.isImage && row.assetKind !== 'video').map((row) => ({ name: row.name, href: row.href, size: row.size })),
      links: items.filter((row) => !row.isImage && row.assetKind === 'video').map((row) => ({ title: row.name, href: row.href })),
    });
  }

  return { hero, groups };
}

/** Speakers, authors, members: the people a material names, linked to their page where one exists. */
async function loadPeople(groupId: string, detailId: string, def: ContentTypeDef, lang: string): Promise<PublicPeopleGroup[]> {
  const locale = localeOf(lang);
  const groups: PublicPeopleGroup[] = [];

  for (const field of def.fields) {
    if (field.kind !== 'authors' && field.kind !== 'people') continue;

    type Person = { name: string; note: string; researcherId: string | null; groupIdRef: string | null };
    let people: Person[] = [];

    if (field.kind === 'authors') {
      const stored = await prisma.authorship.findMany({ where: { groupId }, orderBy: { sortOrder: 'asc' } });
      people = stored.map((row) => ({
        name: trimmed(row.fullName),
        note: row.role === 'author' ? '' : row.role,
        researcherId: row.researcherId,
        groupIdRef: null,
      }));
    } else if (detailId && def.key === 'event') {
      const stored = await prisma.eventSpeaker.findMany({ where: { eventId: detailId }, orderBy: { sortOrder: 'asc' } });
      people = stored.map((row) => ({
        name: trimmed(row.fullName),
        note: trimmed(row.affiliation),
        researcherId: row.researcherId,
        groupIdRef: null,
      }));
    } else if (detailId && (def.key === 'research_direction' || def.key === 'research_project')) {
      const stored: { researcherGroupId: string; role: string }[] =
        def.key === 'research_direction'
          ? await prisma.researchDirectionMember.findMany({ where: { directionId: detailId }, select: { researcherGroupId: true, role: true }, orderBy: { id: 'asc' } })
          : await prisma.researchProjectMember.findMany({ where: { projectId: detailId }, select: { researcherGroupId: true, role: true }, orderBy: { id: 'asc' } });
      people = stored.map((row) => ({ name: '', note: row.role === 'member' ? '' : row.role, researcherId: null, groupIdRef: row.researcherGroupId }));
    }

    const unnamed = people.filter((person) => !person.name && person.groupIdRef);
    if (unnamed.length) {
      const titles = await pagesByGroupId(unnamed.map((person) => person.groupIdRef as string), lang);
      for (const person of unnamed) {
        const title = person.groupIdRef ? titles.get(person.groupIdRef) : undefined;
        if (title) person.name = title.title;
      }
    }

    const researcherIds = people.map((person) => person.researcherId).filter((id): id is string => Boolean(id));
    const hrefs = await pagesByDetailId('researcher', researcherIds, lang);
    const rows = people
      .filter((person) => person.name)
      .map((person) => ({
        name: person.name,
        note: person.note,
        href: person.researcherId ? (hrefs.get(person.researcherId)?.href ?? '') : '',
      }));

    if (rows.length) groups.push({ label: fieldLabel(locale, field.name, field.label), rows });
  }

  return groups;
}

/** Departments, journals, projects and other materials this one points at. */
async function loadLinks(def: ContentTypeDef, itemId: string, detail: Row | null, detailId: string, lang: string): Promise<PublicLinkGroup[]> {
  const locale = localeOf(lang);
  const groups: PublicLinkGroup[] = [];

  for (const field of def.fields) {
    if (field.kind !== 'contentRef' || !field.target) continue;
    const targetKey = DETAIL_KEY_BY_TYPE[field.target as keyof typeof DETAIL_KEY_BY_TYPE];
    if (!targetKey) continue;

    let rows: { title: string; href: string }[] = [];

    if (!field.many) {
      const id = trimmed(detail?.[field.name]);
      rows = id ? [...(await pagesByDetailId(field.target, [id], lang)).values()] : [];
    } else if (detailId && `${def.key}.${field.name}` === 'research_direction.projects') {
      const stored = await prisma.researchProject.findMany({ where: { directionId: detailId }, select: { id: true } });
      rows = [...(await pagesByDetailId('research_project', stored.map((row) => row.id), lang)).values()];
    } else if (detailId && `${def.key}.${field.name}` === 'partner.projects') {
      const stored = await prisma.partnerProject.findMany({ where: { partnerId: detailId }, select: { projectId: true } });
      rows = [...(await pagesByDetailId('research_project', stored.map((row) => row.projectId), lang)).values()];
    } else {
      const stored = await prisma.contentRelation.findMany({
        where: { itemId, reason: field.name },
        select: { targetGroupId: true },
        orderBy: { sortOrder: 'asc' },
      });
      const pages = await pagesByGroupId(stored.map((row) => row.targetGroupId), lang);
      rows = stored.map((row) => pages.get(row.targetGroupId)).filter((row): row is { title: string; href: string } => Boolean(row));
    }

    if (rows.length) groups.push({ label: fieldLabel(locale, field.name, field.label), rows });
  }

  return groups;
}

const BASE_SELECT = {
  id: true,
  groupId: true,
  lang: true,
  title: true,
  subtitle: true,
  slug: true,
  excerpt: true,
  body: true,
  publishedAt: true,
  status: true,
  deletedAt: true,
  seoTitle: true,
  seoDescription: true,
  keywords: true,
  canonicalUrl: true,
  ogTitle: true,
  ogDescription: true,
  noIndex: true,
  tags: { select: { tag: { select: { slug: true, translations: { select: { lang: true, name: true } } } } } },
} as const;

/** The shape of the row `readMaterial` asks Prisma for; the detail relation is chosen per type. */
interface MaterialRow {
  id: string;
  groupId: string;
  lang: string;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  body: string | null;
  publishedAt: Date | null;
  status: string;
  deletedAt: Date | null;
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  noIndex: boolean;
  tags: { tag: { slug: string; translations: { lang: string; name: string }[] } }[];
  group: Row & { type: string; page: { pathOverride: string | null } | null };
}

/**
 * One material page. The caller says which type and how the visitor addressed it, because the same
 * material has one address per language and only one of them is the page being drawn.
 */
async function readMaterial(where: Row, typeKey: string, lang: string): Promise<PublicPage | null> {
  const detailKey = detailKeyOf(typeKey);
  const groupSelect: Row = { type: true, page: { select: { pathOverride: true } } };
  if (detailKey) groupSelect[detailKey] = true;

  const item = (await prisma.contentItem.findFirst({
    where: where as never,
    select: { ...BASE_SELECT, group: { select: groupSelect } } as never,
  })) as unknown as MaterialRow | null;

  if (!item || item.deletedAt || item.status !== CONTENT_STATUS.PUBLISHED || item.group.type !== typeKey) return null;

  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) return null;

  const pathOverride = trimmed(item.group.page?.pathOverride) || null;
  const detail = ((detailKey ? item.group[detailKey] : null) ?? null) as Row | null;
  const detailId = trimmed(detail?.id);
  const href = pathOf(typeKey, item.slug, pathOverride, lang);

  // The detail row is read as its own columns only, so the rubric name comes from its own lookup.
  const categoryId = trimmed(detail?.categoryId);
  const categoryRow = CATEGORY_DETAIL[typeKey] && categoryId
    ? await prisma.category.findUnique({
        where: { id: categoryId },
        select: { slug: true, translations: { select: { lang: true, name: true } } },
      })
    : null;

  const canonical = listingSpecFor(typeKey);

  const page: PublicPage = {
    itemId: item.id,
    groupId: item.groupId,
    typeKey,
    lang,
    title: item.title,
    subtitle: trimmed(item.subtitle),
    excerpt: trimmed(item.excerpt),
    body: sanitizeContentHtml(item.body ?? ''),
    href,
    publishedAt: item.publishedAt,
    category: categoryRow
      ? {
          name: categoryRow.translations.find((entry) => entry.lang === lang)?.name ?? categoryRow.translations[0]?.name ?? categoryRow.slug,
          slug: categoryRow.slug,
        }
      : null,
    tags: item.tags.map((link) => ({
      name: link.tag.translations.find((entry) => entry.lang === lang)?.name ?? link.tag.translations[0]?.name ?? link.tag.slug,
      slug: link.tag.slug,
    })),
    hero: null,
    facts: [],
    sections: [],
    mediaGroups: [],
    people: [],
    links: [],
    others: [],
    listHref: canonical ? `/${lang}/${canonical.path}` : '',
    listTitle: sectionName(lang, canonical?.title, typeKey),
    seo: {
      title: trimmed(item.seoTitle),
      description: trimmed(item.seoDescription),
      keywords: trimmed(item.keywords),
      canonical: trimmed(item.canonicalUrl),
      ogTitle: trimmed(item.ogTitle),
      ogDescription: trimmed(item.ogDescription),
      ogImage: '',
      noIndex: item.noIndex,
    },
  };

  const locale = localeOf(lang);
  for (const field of factFields(def)) {
    const raw = field.name in item ? (item as unknown as Row)[field.name] : detail?.[field.name];
    const value = field.kind === 'json' ? { value: '', href: '', long: false } : formatFact(field, raw, lang);
    if (value.value) page.facts.push({ label: fieldLabel(locale, field.name, field.label), ...value });
  }

  for (const field of def.fields) {
    if (field.kind === 'json') {
      const rows = parsedLinks(detail?.[field.name]);
      if (rows.length) page.links.push({ label: fieldLabel(locale, field.name, field.label), rows });
      continue;
    }
    if (field.kind !== 'richtext' || field.name === 'body') continue;
    const html = sanitizeContentHtml(String(detail?.[field.name] ?? ''));
    if (html) page.sections.push({ label: fieldLabel(locale, field.name, field.label), html });
  }

  const media = await loadMedia(item.groupId, def, lang);
  page.hero = media.hero;
  page.mediaGroups = media.groups;
  page.people = await loadPeople(item.groupId, detailId, def, lang);
  page.links.push(...(await loadLinks(def, item.id, detail, detailId, lang)));

  const og = await prisma.mediaLink.findFirst({
    where: { groupId: item.groupId, role: 'og' },
    select: { media: { select: { publicUrl: true, status: true } } },
  });
  if (og?.media.status === 'ready') page.seo.ogImage = og.media.publicUrl;

  const others = await prisma.contentItem.findMany({
    where: { groupId: item.groupId, status: CONTENT_STATUS.PUBLISHED, deletedAt: null },
    select: { lang: true, slug: true },
    orderBy: { lang: 'asc' },
  });
  page.others = others.map((row) => ({ lang: row.lang, href: pathOf(typeKey, row.slug, pathOverride, row.lang) }));

  return page;
}

/** A material at `<section>/<slug>`; null means the address is not a page of this site. */
export async function materialAt(spec: ListingSpec, slug: string, lang: string): Promise<PublicPage | null> {
  const page = await readMaterial({ lang, slug, group: { type: spec.typeKey, deletedAt: null } }, spec.typeKey, lang);
  return inSection(page, spec, lang);
}

/**
 * The same material through an address written in another language.
 *
 * The language switch changes the prefix of the address and nothing else, while every language names
 * its own version of a material. A visitor who switched to English for a news item that Russian calls
 * by another name is asking for that item, not for a page that does not exist.
 */
export async function materialThroughOtherLanguage(spec: ListingSpec, slug: string, lang: string): Promise<PublicPage | null> {
  const source = await prisma.contentItem.findFirst({
    where: { slug, status: CONTENT_STATUS.PUBLISHED, deletedAt: null, group: { type: spec.typeKey, deletedAt: null } },
    orderBy: { createdAt: 'asc' },
    select: { groupId: true },
  });
  if (!source) return null;
  const page = await readMaterial({ groupId: source.groupId, lang, group: { type: spec.typeKey, deletedAt: null } }, spec.typeKey, lang);
  return inSection(page, spec, lang);
}

function inSection(page: PublicPage | null, spec: ListingSpec, lang: string): PublicPage | null {
  if (!page) return null;
  // The address the visitor used decides which section the page sits under, so a manuscript reached
  // through the digitised shelf keeps that shelf as its parent even though it also belongs to /manuscripts.
  if (page.listHref !== `/${lang}/${spec.path}`) {
    page.listHref = `/${lang}/${spec.path}`;
    page.listTitle = sectionName(lang, spec.title, spec.typeKey);
  }
  return page;
}

/**
 * A page at the address its author chose: the fixed path if one was set, else the slug. Pages are the
 * only materials that live outside a section, which is why their address cannot be derived from a table.
 */
export async function pageAt(path: string, lang: string): Promise<PublicPage | null> {
  const withOverride = await prisma.page.findFirst({
    where: { pathOverride: path, group: { deletedAt: null, type: 'page' } },
    select: { groupId: true },
  });
  if (withOverride) {
    return readMaterial({ groupId: withOverride.groupId, lang, group: { type: 'page', deletedAt: null } }, 'page', lang);
  }
  if (path.includes('/')) return null;
  return readMaterial({ lang, slug: path, group: { type: 'page', deletedAt: null } }, 'page', lang);
}

/**
 * Whether another language has this material published while the asked-for one does not.
 *
 * A translation can carry its own address, so switching language on a material page does not always
 * lead to the same version. Sending that visitor to the section in the language they chose is honest;
 * a 404 would tell them the link they just clicked is broken when it is only untranslated.
 */
export async function materialPublishedElsewhere(typeKey: string, slug: string, lang: string): Promise<boolean> {
  const item = await prisma.contentItem.findFirst({
    where: {
      slug,
      lang: { not: lang },
      status: CONTENT_STATUS.PUBLISHED,
      deletedAt: null,
      group: { type: typeKey, deletedAt: null },
    },
    select: { id: true },
  });
  return Boolean(item);
}

/** The same for a page, which is addressed by its chosen path or, when it has none, by its slug. */
export async function pagePublishedElsewhere(path: string, lang: string): Promise<boolean> {
  const other = { lang: { not: lang }, status: CONTENT_STATUS.PUBLISHED, deletedAt: null };
  const bySlug = await prisma.contentItem.findFirst({
    where: { ...other, slug: path, group: { type: 'page', deletedAt: null } },
    select: { id: true },
  });
  if (bySlug) return true;
  if (path.includes('/')) return false;
  const byPath = await prisma.page.findFirst({
    where: { pathOverride: path, group: { type: 'page', deletedAt: null, items: { some: other } } },
    select: { id: true },
  });
  return Boolean(byPath);
}

/** A page reached through another language's address: the same page, at the address it has here. */
export async function pageThroughOtherLanguage(path: string, lang: string): Promise<PublicPage | null> {
  const source = await prisma.contentItem.findFirst({
    where: {
      slug: path,
      lang: { not: lang },
      status: CONTENT_STATUS.PUBLISHED,
      deletedAt: null,
      group: { type: 'page', deletedAt: null },
    },
    orderBy: { createdAt: 'asc' },
    select: { groupId: true },
  });
  if (!source) return null;
  return readMaterial({ groupId: source.groupId, lang, group: { type: 'page', deletedAt: null } }, 'page', lang);
}
