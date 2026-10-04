/**
 * Reads a material (or an empty slate for a new one) into the plain data a Client Component needs.
 *
 * The generic editor never queries the database itself: every field description, option list and
 * current value arrives here, already translated for the interface language of the administrator.
 */
import 'server-only';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { can, type PermissionSubject } from '@/lib/rbac';
import {
  CONTENT_TYPE_MAP,
  DETAIL_KEY_BY_TYPE,
  MEDIA_FIELD_ROLE,
  STRUCTURED_FIELD_KINDS,
  type ContentTypeDef,
  type DetailKey,
  type FieldDef,
} from '@/lib/content-types';
import { fieldHint, fieldLabel, optionLabel } from '@/lib/admin/field-labels';
import { editorLabels, materialFormLabels, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/labels';
import { adminPreviewPath } from './routes';
import { toMediaFieldValue } from './media-value';
import type {
  FormFieldSchema,
  FormOption,
  MaterialFormInit,
  MediaFieldValue,
  MediaRef,
  PersonOption,
  PersonValue,
  RefOption,
  RefValue,
  ScalarValue,
} from './form-types';

/** All detail tables at once; the registry decides which of the returned values is read. */
const DETAIL_INCLUDE = {
  news: true,
  article: true,
  book: true,
  publication: true,
  manuscript: true,
  dissertation: true,
  event: true,
  announcement: true,
  researcher: true,
  department: true,
  researchDirection: true,
  researchProject: true,
  partner: true,
  document: true,
  page: true,
  journal: true,
} as const satisfies Record<DetailKey, true>;

/** Registry field name → column on ContentItem. */
const ITEM_COLUMNS: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  slug: 'slug',
  lang: 'lang',
  excerpt: 'excerpt',
  author: 'authorId',
  publishedAt: 'publishedAt',
  seoTitle: 'seoTitle',
  seoDescription: 'seoDescription',
  keywords: 'keywords',
  canonicalUrl: 'canonicalUrl',
  ogTitle: 'ogTitle',
  ogDescription: 'ogDescription',
};

/** Registry field name → column on ContentGroup, i.e. shared by all language versions. */
const GROUP_COLUMNS: Record<string, 'isFeatured'> = { isFeatured: 'isFeatured' };

export interface MaterialPermissions {
  create: boolean;
  edit: boolean;
  publish: boolean;
  review: boolean;
}

export interface BuildFormArgs {
  typeKey: string;
  itemId: string | null;
  /** Language of this version of the material. */
  lang: string;
  locale: AdminLocale;
  permissions: MaterialPermissions;
}

interface Candidate {
  detailId: string;
  groupId: string;
  title: string;
  slug: string;
}

export function typeDefOr404(typeKey: string): ContentTypeDef {
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) notFound();
  return def;
}

export function typeLabel(locale: AdminLocale, typeKey: string): string {
  return translate(locale, `type.${typeKey}` as TranslationKey);
}

/** What the current administrator may do with materials of one type. */
export function materialPermissions(subject: PermissionSubject, typeKey: string): MaterialPermissions {
  return {
    create: can(subject, `${typeKey}.create`),
    edit: can(subject, `${typeKey}.edit`),
    publish: can(subject, `${typeKey}.publish`),
    review: can(subject, `${typeKey}.review`),
  };
}

/** Materials of one type, labelled with the title in the requested language. */
async function loadCandidates(targetKey: string, lang: string, limit = 200): Promise<Candidate[]> {
  const detailKey = DETAIL_KEY_BY_TYPE[targetKey as keyof typeof DETAIL_KEY_BY_TYPE];
  if (!detailKey) return [];

  const groups = await prisma.contentGroup.findMany({
    where: { type: targetKey, deletedAt: null },
    include: {
      ...DETAIL_INCLUDE,
      items: {
        where: { deletedAt: null },
        orderBy: [{ lang: 'asc' }, { updatedAt: 'desc' }],
        take: 5,
        select: { title: true, slug: true, lang: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const rows: Candidate[] = [];
  for (const group of groups) {
    const detail = group[detailKey];
    if (!detail) continue;
    const item = group.items.find((entry) => entry.lang === lang) ?? group.items[0];
    if (!item) continue;
    rows.push({ detailId: detail.id, groupId: group.id, title: item.title, slug: item.slug });
  }
  return rows;
}

function fieldSchema(def: ContentTypeDef, field: FieldDef, locale: AdminLocale): FormFieldSchema {
  return {
    name: field.name,
    kind: field.kind,
    label: fieldLabel(locale, field.name, field.label),
    required: field.required === true,
    rows: field.rows,
    section: field.section ?? 'main',
    hint: fieldHint(locale, field.name) ?? field.hint,
    many: field.many,
    target: field.target,
    targetLabel: field.target ? typeLabel(locale, field.target) : undefined,
    options: field.options?.map((option) => ({
      value: option.value,
      label: optionLabel(locale, option.value, option.label),
    })),
  };
}

function dateToInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateTimeToInput(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Database value → what the matching input element expects. */
function scalarToInput(kind: FieldDef['kind'], value: unknown): ScalarValue {
  if (value === null || value === undefined) return kind === 'checkbox' ? false : null;
  if (value instanceof Date) return kind === 'datetime' ? dateTimeToInput(value) : dateToInput(value);
  if (kind === 'checkbox') return Boolean(value);
  if (kind === 'number') {
    const num = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(num) ? num : null;
  }
  return String(value);
}

function emptyMediaMaps(def: ContentTypeDef) {
  const mediaValues: Record<string, MediaFieldValue[]> = {};
  const mediaRefs: Record<string, MediaRef[]> = {};
  for (const field of def.fields) {
    if (MEDIA_FIELD_ROLE[field.name]) {
      mediaValues[field.name] = [];
      mediaRefs[field.name] = [];
    }
  }
  return { mediaValues, mediaRefs };
}

async function loadMedia(def: ContentTypeDef, groupId: string) {
  const { mediaValues, mediaRefs } = emptyMediaMaps(def);
  const roleToField = new Map<string, string>();
  for (const field of def.fields) {
    const role = MEDIA_FIELD_ROLE[field.name];
    if (role) roleToField.set(role, field.name);
  }

  const links = await prisma.mediaLink.findMany({
    where: { groupId },
    include: { media: { include: { variants: true, folder: true } } },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });

  for (const link of links) {
    const fieldName = roleToField.get(link.role);
    if (!fieldName) continue;
    mediaValues[fieldName].push(toMediaFieldValue({ ...link.media, folderPath: link.media.folder?.name ?? null }, link.caption));
    mediaRefs[fieldName].push({ mediaId: link.mediaId, caption: link.caption ?? '' });
  }
  return { mediaValues, mediaRefs };
}

function personFrom(
  researcherIndex: Map<string, Candidate>,
  groupIndex: Map<string, Candidate>,
  ref: { detailId?: string | null; groupId?: string | null },
): Candidate | undefined {
  if (ref.detailId) {
    const byDetail = researcherIndex.get(ref.detailId);
    if (byDetail) return byDetail;
  }
  return ref.groupId ? groupIndex.get(ref.groupId) : undefined;
}

async function loadPeople(def: ContentTypeDef, groupId: string, detailId: string, researcherIndex: Map<string, Candidate>, groupIndex: Map<string, Candidate>) {
  const personRefs: Record<string, PersonValue[]> = {};
  for (const field of def.fields) {
    if (field.kind === 'authors' || field.kind === 'people') personRefs[field.name] = [];
  }

  for (const field of def.fields) {
    if (field.kind === 'authors') {
      const rows = await prisma.authorship.findMany({ where: { groupId }, orderBy: { sortOrder: 'asc' } });
      for (const row of rows) {
        const person = personFrom(researcherIndex, groupIndex, { detailId: row.researcherId });
        personRefs[field.name].push({
          detailId: row.researcherId ?? null,
          groupId: person?.groupId ?? null,
          fullName: row.fullName ?? person?.title ?? '',
          note: row.role === 'author' ? '' : row.role,
        });
      }
      continue;
    }
    if (field.kind !== 'people' || !detailId) continue;

    if (def.key === 'event') {
      const rows = await prisma.eventSpeaker.findMany({ where: { eventId: detailId }, orderBy: { sortOrder: 'asc' } });
      for (const row of rows) {
        const person = personFrom(researcherIndex, groupIndex, { detailId: row.researcherId });
        personRefs[field.name].push({
          detailId: row.researcherId ?? null,
          groupId: person?.groupId ?? null,
          fullName: row.fullName ?? person?.title ?? '',
          note: row.affiliation ?? '',
        });
      }
    } else if (def.key === 'research_direction' || def.key === 'research_project') {
      const rows =
        def.key === 'research_direction'
          ? await prisma.researchDirectionMember.findMany({ where: { directionId: detailId }, orderBy: { id: 'asc' } })
          : await prisma.researchProjectMember.findMany({ where: { projectId: detailId }, orderBy: { id: 'asc' } });
      for (const row of rows) {
        const person = personFrom(researcherIndex, groupIndex, { groupId: row.researcherGroupId });
        personRefs[field.name].push({
          detailId: person?.detailId ?? null,
          groupId: row.researcherGroupId,
          fullName: person?.title ?? '',
          note: row.role === 'member' ? '' : row.role,
        });
      }
    }
  }
  return personRefs;
}

async function loadContentRefs(
  def: ContentTypeDef,
  itemId: string,
  detailId: string,
  scalars: Record<string, ScalarValue>,
  candidates: Map<string, Candidate[]>,
) {
  const contentRefs: Record<string, RefValue[]> = {};
  const byDetailId = new Map<string, RefValue>();
  const byGroupId = new Map<string, RefValue>();
  for (const list of candidates.values()) {
    for (const entry of list) {
      const value: RefValue = { detailId: entry.detailId, groupId: entry.groupId };
      byDetailId.set(entry.detailId, value);
      byGroupId.set(entry.groupId, value);
    }
  }

  for (const field of def.fields) {
    if (field.kind !== 'contentRef') continue;
    contentRefs[field.name] = [];

    if (!field.many) {
      const raw = scalars[field.name];
      if (typeof raw === 'string' && raw) {
        contentRefs[field.name].push(byDetailId.get(raw) ?? { detailId: raw, groupId: '' });
        scalars[field.name] = null;
      }
      continue;
    }
    if (!detailId) continue;

    const key = `${def.key}.${field.name}`;
    if (key === 'research_direction.projects') {
      const rows = await prisma.researchProject.findMany({ where: { directionId: detailId }, select: { id: true, groupId: true } });
      contentRefs[field.name] = rows.map((row) => ({ detailId: row.id, groupId: row.groupId }));
    } else if (key === 'partner.projects') {
      const rows = await prisma.partnerProject.findMany({ where: { partnerId: detailId }, select: { projectId: true } });
      contentRefs[field.name] = rows
        .map((row) => byDetailId.get(row.projectId))
        .filter((value): value is RefValue => Boolean(value));
    } else {
      const rows = await prisma.contentRelation.findMany({ where: { itemId, reason: field.name }, select: { targetGroupId: true } });
      contentRefs[field.name] = rows
        .map((row) => byGroupId.get(row.targetGroupId))
        .filter((value): value is RefValue => Boolean(value));
    }
  }
  return contentRefs;
}

/** Categories of one content type, labelled in the requested language. */
export async function categoryOptions(scope: string | undefined, lang: string): Promise<FormOption[]> {
  if (!scope) return [];
  const rows = await prisma.category.findMany({
    where: { scope, isActive: true },
    include: { translations: true },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
  });
  return rows.map((row) => {
    const translation = row.translations.find((entry) => entry.lang === lang) ?? row.translations[0];
    return { value: row.id, label: translation?.name ?? row.slug };
  });
}

export async function buildMaterialFormInit(args: BuildFormArgs): Promise<MaterialFormInit> {
  const def = typeDefOr404(args.typeKey);
  const fields = def.fields.map((field) => fieldSchema(def, field, args.locale));

  const scalars: Record<string, ScalarValue> = {};
  const bodies: Record<string, string> = {};
  for (const field of def.fields) {
    if (field.kind === 'richtext') bodies[field.name] = '';
    else if (field.kind === 'tags') scalars[field.name] = '';
    else if (!STRUCTURED_FIELD_KINDS.has(field.kind)) {
      scalars[field.name] = field.kind === 'checkbox' ? false : null;
    }
  }
  scalars.lang = args.lang;

  const itemId = args.itemId;
  let groupId: string | null = null;
  let detailId = '';
  let status = 'draft';
  let revision = 0;

  let mediaValues = emptyMediaMaps(def).mediaValues;
  let mediaRefs = emptyMediaMaps(def).mediaRefs;
  let personRefs: Record<string, PersonValue[]> = {};
  let contentRefs: Record<string, RefValue[]> = {};

  const targets = [...new Set(def.fields.filter((field) => field.target).map((field) => field.target as string))];
  const candidates = new Map<string, Candidate[]>();
  for (const target of targets) candidates.set(target, await loadCandidates(target, args.lang));

  const researcherIndex = new Map<string, Candidate>();
  const groupIndex = new Map<string, Candidate>();
  for (const list of candidates.values()) {
    for (const entry of list) {
      researcherIndex.set(entry.detailId, entry);
      groupIndex.set(entry.groupId, entry);
    }
  }

  if (itemId) {
    const item = await prisma.contentItem.findUnique({
      where: { id: itemId },
      include: {
        group: { include: DETAIL_INCLUDE },
        tags: { include: { tag: { include: { translations: true } } } },
      },
    });
    if (!item || item.group.type !== def.key) notFound();

    groupId = item.groupId;
    status = item.status;
    revision = item.revision;

    const detailKey = DETAIL_KEY_BY_TYPE[def.key as keyof typeof DETAIL_KEY_BY_TYPE];
    const detail = (item.group[detailKey] ?? null) as unknown as Record<string, unknown> | null;
    detailId = typeof detail?.id === 'string' ? detail.id : '';

    for (const field of def.fields) {
      if (field.kind === 'tags') {
        scalars[field.name] = item.tags
          .map((link) => link.tag.translations.find((entry) => entry.lang === item.lang)?.name ?? link.tag.translations[0]?.name ?? link.tag.slug)
          .join(', ');
        continue;
      }
      if (STRUCTURED_FIELD_KINDS.has(field.kind)) continue;
      if (field.kind === 'richtext') {
        bodies[field.name] = field.name === 'body' ? (item.body ?? '') : String(detail?.[field.name] ?? '');
        continue;
      }
      const groupColumn = GROUP_COLUMNS[field.name];
      const itemColumn = ITEM_COLUMNS[field.name];
      if (groupColumn) scalars[field.name] = scalarToInput(field.kind, item.group[groupColumn]);
      else if (itemColumn) scalars[field.name] = scalarToInput(field.kind, (item as unknown as Record<string, unknown>)[itemColumn]);
      else if (detail) scalars[field.name] = scalarToInput(field.kind, detail[field.name]);
      scalars[field.name] = scalars[field.name] ?? (field.options?.some((option) => option.value === 'none') ? 'none' : null);
    }
    scalars.lang = item.lang;
  }

  if (groupId) {
    const loaded = await loadMedia(def, groupId);
    mediaValues = loaded.mediaValues;
    mediaRefs = loaded.mediaRefs;
    personRefs = await loadPeople(def, groupId, detailId, researcherIndex, groupIndex);
  }
  if (itemId) {
    contentRefs = await loadContentRefs(def, itemId, detailId, scalars, candidates);
  } else {
    contentRefs = await loadContentRefs(def, '', detailId, scalars, candidates);
  }

  const languages = await prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const users = await prisma.user.findMany({
    where: { status: { in: ['active', 'invited'] } },
    orderBy: { displayName: 'asc' },
    select: { id: true, displayName: true },
  });

  return {
    typeKey: def.key,
    typeLabel: typeLabel(args.locale, def.key),
    itemId,
    groupId,
    status,
    revision,
    needsReview: def.needsReview,
    locale: args.locale,
    fields,
    scalars,
    bodies,
    mediaRefs,
    personRefs,
    contentRefs,
    mediaValues,
    categoryOptions: await categoryOptions(def.categoryScope, args.lang),
    languageOptions: languages.map((language) => ({ value: language.code, label: language.nativeName })),
    authorOptions: users.map((user) => ({ value: user.id, label: user.displayName })),
    personOptions: (candidates.get('researcher') ?? []).map<PersonOption>((entry) => ({
      detailId: entry.detailId,
      groupId: entry.groupId,
      label: entry.title,
    })),
    refOptions: Object.fromEntries(
      def.fields
        .filter((field) => field.kind === 'contentRef' && field.target)
        .map((field) => [field.name, (candidates.get(field.target as string) ?? []).map((entry) => ({
          detailId: entry.detailId,
          groupId: entry.groupId,
          label: entry.title,
        })) satisfies RefOption[]]),
    ),
    canCreate: args.permissions.create,
    canEdit: args.permissions.edit,
    canPublish: args.permissions.publish,
    canReview: args.permissions.review,
    labels: materialFormLabels(args.locale),
    editorLabels: editorLabels(args.locale),
    previewBase: itemId ? adminPreviewPath(def.key, itemId) : null,
    nowMs: Date.now(),
  };
}
