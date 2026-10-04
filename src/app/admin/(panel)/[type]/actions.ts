/**
 * The single save routine behind every content type.
 *
 * It reads the generic form, decides where each registry field belongs (ContentItem column,
 * ContentGroup column, the type's own detail table, or a relation table), applies the workflow
 * rules — an author without the publish right can only send material for review — and keeps a
 * revision snapshot plus an audit entry. A changed slug leaves a redirect behind so that links
 * and search-engine results keep working.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { diffFields, recordAudit } from '@/lib/auth/audit';
import { fieldLabel } from '@/lib/admin/field-labels';
import { actorLocale, getAdminLocale } from '@/lib/admin/i18n';
import { BULK_LIMIT, BULK_PERMISSION, BULK_STATUS, isBulkAction } from '@/lib/admin/list-query';
import { localeOf, statusLabel, translate, type TranslationKey } from '@/lib/admin/labels';
import { CONTENT_TYPE_MAP, MEDIA_FIELD_ROLE, type ContentTypeDef, type FieldDef } from '@/lib/content-types';
import { adminEditPath, adminListPath, adminPreviewPath, localizedPath } from '@/lib/content/routes';
import { sanitizeContentHtml } from '@/lib/content/html';
import { slugify } from '@/lib/slug';
import { uniqueSlug } from '@/lib/content/unique-slug';
import { syncTags } from '@/lib/content/sync-tags';
import { NONE, parseJsonArray, splitTags, type MediaRef, type PersonValue, type RefValue } from '@/lib/content/form-types';
import type { ActionState } from '@/lib/admin/action-state';

type Intent = 'draft' | 'preview' | 'review' | 'publish';
type Column = string | number | boolean | Date | null;

/** Registry field name → ContentItem column. */
const ITEM_COLUMNS: Record<string, string> = {
  title: 'title',
  subtitle: 'subtitle',
  slug: 'slug',
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

/**
 * ContentItem columns that a revision does not copy. They still belong in the "Changes" column of
 * the version list, so a save that only touched SEO says so instead of looking like a no-op.
 * Key: column on the row, value: field name used for the translated label.
 */
const SUMMARY_COLUMNS: Record<string, string> = {
  seoTitle: 'seoTitle',
  seoDescription: 'seoDescription',
  keywords: 'keywords',
  canonicalUrl: 'canonicalUrl',
  ogTitle: 'ogTitle',
  ogDescription: 'ogDescription',
  ogImageAssetId: 'ogImage',
  noIndex: 'noIndex',
};

type MetaRow = {
  seoTitle: string | null;
  seoDescription: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageAssetId: string | null;
  noIndex: boolean;
};

function metaChanges(before: MetaRow, after: MetaRow): string[] {
  return Object.entries(SUMMARY_COLUMNS)
    .filter(([column]) => before[column as keyof MetaRow] !== after[column as keyof MetaRow])
    .map(([, label]) => label);
}

/** Detail columns that mirror a media choice so the public site can read them directly. */
const MEDIA_OWNER_COLUMN: Record<string, string> = {
  photo: 'photoAssetId',
  logo: 'logoAssetId',
  file: 'assetId',
};

interface DetailDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

function detailDelegate(client: unknown, model: string): DetailDelegate {
  return (client as Record<string, DetailDelegate>)[model];
}

function text(form: FormData, name: string): string | null {
  const raw = form.get(name);
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value === NONE) return null;
  return value;
}

function toDate(kind: FieldDef['kind'], value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(kind === 'date' ? `${value}T00:00:00Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Converts one form field into the value its column expects. */
function scalarValue(field: FieldDef, form: FormData): Column {
  const raw = text(form, field.name);
  switch (field.kind) {
    case 'checkbox':
      return form.get(field.name) === '1';
    case 'number':
      return raw === null ? null : Number.parseInt(raw, 10);
    case 'date':
    case 'datetime':
      return toDate(field.kind, raw);
    default:
      return raw;
  }
}

function isEmpty(kind: FieldDef['kind'], value: Column): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (typeof value === 'boolean') return false;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return String(value).trim() === '';
}

/** Old address of a material whose slug changed: visitors and search engines get redirected. */
async function recordSlugRedirect(client: Prisma.TransactionClient, args: { lang: string; typeKey: string; oldSlug: string; newSlug: string }) {
  const source = localizedPath({ typeKey: args.typeKey, slug: args.oldSlug }, args.lang);
  const target = localizedPath({ typeKey: args.typeKey, slug: args.newSlug }, args.lang);
  if (source === target) return;
  await client.redirect.upsert({
    where: { sourcePath: source },
    create: { sourcePath: source, targetPath: target, redirectType: 'permanent', origin: 'slug_change', note: `Automatic: ${args.typeKey} slug changed` },
    update: { targetPath: target, redirectType: 'permanent', origin: 'slug_change', isActive: true },
  });
  // Returning to a former slug (restoring a version) makes the two addresses point at each other;
  // the old rule would then forward visitors in a loop, so it is dropped instead of re-pointed.
  const reciprocal = await client.redirect.findFirst({ where: { sourcePath: target, targetPath: source }, select: { sourcePath: true } });
  if (reciprocal) await client.redirect.delete({ where: { sourcePath: reciprocal.sourcePath } });
  await client.redirect.updateMany({ where: { targetPath: source }, data: { targetPath: target } });
}

/** Replaces the media of one role only, so a second file list on the same material survives. */
async function syncMedia(client: Prisma.TransactionClient, groupId: string, media: Record<string, MediaRef[]>) {
  const wanted = new Map<string, MediaRef[]>();
  for (const [field, list] of Object.entries(media)) {
    const role = MEDIA_FIELD_ROLE[field];
    if (role) wanted.set(role, list);
  }

  const ids = [...new Set([...wanted.values()].flat().map((ref) => ref.mediaId))];
  const found = ids.length ? await client.media.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
  const valid = new Set(found.map((row) => row.id));

  for (const [role, list] of wanted) {
    await client.mediaLink.deleteMany({ where: { groupId, role } });
    let order = 0;
    for (const ref of list) {
      if (!valid.has(ref.mediaId)) continue;
      await client.mediaLink.create({
        data: { groupId, mediaId: ref.mediaId, role, caption: ref.caption?.trim() || null, sortOrder: order },
      });
      order += 1;
    }
  }

  const og = (wanted.get('og') ?? []).find((ref) => valid.has(ref.mediaId));
  return og?.mediaId ?? null;
}

async function syncPeople(client: Prisma.TransactionClient, args: {
  def: ContentTypeDef;
  groupId: string;
  detailId: string;
  people: Record<string, PersonValue[]>;
}) {
  for (const field of args.def.fields) {
    if (field.kind === 'authors') {
      await client.authorship.deleteMany({ where: { groupId: args.groupId } });
      let order = 0;
      for (const row of args.people[field.name] ?? []) {
        const fullName = row.fullName?.trim();
        if (!fullName && !row.detailId) continue;
        await client.authorship.create({
          data: {
            groupId: args.groupId,
            researcherId: row.detailId || null,
            fullName: fullName || null,
            role: row.note?.trim() || 'author',
            sortOrder: order,
          },
        });
        order += 1;
      }
      continue;
    }

    if (field.kind !== 'people' || !args.detailId) continue;
    const rows = (args.people[field.name] ?? []).filter((row) => row.fullName?.trim() || row.detailId || row.groupId);

    if (args.def.key === 'event') {
      await client.eventSpeaker.deleteMany({ where: { eventId: args.detailId } });
      let order = 0;
      for (const row of rows) {
        await client.eventSpeaker.create({
          data: {
            eventId: args.detailId,
            researcherId: row.detailId || null,
            fullName: row.fullName?.trim() || null,
            affiliation: row.note?.trim() || null,
            sortOrder: order,
          },
        });
        order += 1;
      }
      continue;
    }

    const memberIds = [...new Map(rows.map((row) => [row.groupId, row.note?.trim() || 'member'])).entries()].filter(
      (entry): entry is [string, string] => Boolean(entry[0]),
    );
    if (args.def.key === 'research_direction') {
      await client.researchDirectionMember.deleteMany({ where: { directionId: args.detailId } });
      for (const [researcherGroupId, role] of memberIds) {
        await client.researchDirectionMember.create({ data: { directionId: args.detailId, researcherGroupId, role } });
      }
    } else if (args.def.key === 'research_project') {
      await client.researchProjectMember.deleteMany({ where: { projectId: args.detailId } });
      for (const [researcherGroupId, role] of memberIds) {
        await client.researchProjectMember.create({ data: { projectId: args.detailId, researcherGroupId, role } });
      }
    }
  }
}

/**
 * Many-valued references. Most of them are generic ContentRelation rows, but the schema also
 * models two of them as real foreign keys, so those keep the relation column authoritative.
 */
async function syncRefs(client: Prisma.TransactionClient, args: {
  def: ContentTypeDef;
  itemId: string;
  detailId: string;
  refs: Record<string, RefValue[]>;
}) {
  for (const field of args.def.fields) {
    if (field.kind !== 'contentRef' || !field.many) continue;
    const key = `${args.def.key}.${field.name}`;
    const chosen = (args.refs[field.name] ?? []).filter((row) => row.groupId);

    if (key === 'research_direction.projects') {
      const keep = chosen.map((row) => row.groupId);
      await client.researchProject.updateMany({ where: { directionId: args.detailId, groupId: { notIn: keep } }, data: { directionId: null } });
      for (const groupId of keep) {
        const project = await client.researchProject.findFirst({ where: { groupId }, select: { id: true } });
        if (project) await client.researchProject.update({ where: { id: project.id }, data: { directionId: args.detailId } });
      }
      continue;
    }

    if (key === 'partner.projects') {
      await client.partnerProject.deleteMany({ where: { partnerId: args.detailId } });
      for (const row of chosen) {
        const project = await client.researchProject.findFirst({ where: { groupId: row.groupId }, select: { id: true } });
        if (!project) continue;
        await client.partnerProject.upsert({
          where: { partnerId_projectId: { partnerId: args.detailId, projectId: project.id } },
          create: { partnerId: args.detailId, projectId: project.id },
          update: {},
        });
      }
      continue;
    }

    await client.contentRelation.deleteMany({ where: { itemId: args.itemId, reason: field.name } });
    let order = 0;
    for (const row of chosen) {
      await client.contentRelation.create({ data: { itemId: args.itemId, targetGroupId: row.groupId, reason: field.name, sortOrder: order } });
      order += 1;
    }
  }
}

export async function saveMaterial(_prev: ActionState, form: FormData): Promise<ActionState> {
  const typeKey = text(form, 'type');
  const def = typeKey ? CONTENT_TYPE_MAP.get(typeKey) : undefined;
  // Nothing else is known about the caller yet, so this one reply can only use the language cookie.
  if (!def) return { error: translate(await getAdminLocale(), 'error.unknownContentType') };

  const itemId = text(form, 'itemId');
  const intent = (text(form, 'intent') ?? 'draft') as Intent;
  const guard = await assertPermission(itemId ? `${def.key}.edit` : `${def.key}.create`);
  if (!guard.ok) return { error: guard.error };
  const user = guard.user;
  const locale = await actorLocale(user.language);
  const t = (key: TranslationKey) => translate(locale, key);

  const existing = itemId ? await prisma.contentItem.findUnique({ where: { id: itemId }, include: { group: true } }) : null;
  if (itemId && (!existing || existing.group.type !== def.key)) return { error: t('error.materialGone') };
  if (existing?.deletedAt) return { error: t('error.materialInTrash') };

  // ── read the generic form ─────────────────────────────────────────────────────────────
  const itemData: Record<string, Column> = {};
  const detailData: Record<string, Column> = {};
  const bodies: Record<string, string> = {};
  const media: Record<string, MediaRef[]> = {};
  const people: Record<string, PersonValue[]> = {};
  const refs: Record<string, RefValue[]> = {};
  const missing: string[] = [];
  let featured: boolean | null = null;
  let tagNames: string[] = [];

  for (const field of def.fields) {
    const label = fieldLabel(locale, field.name, field.label);

    if (field.kind === 'richtext') {
      const html = sanitizeContentHtml(String(form.get(`__body:${field.name}`) ?? ''));
      bodies[field.name] = html;
      if (field.name !== 'body') detailData[field.name] = html || null;
      if (field.required && !html.replace(/<[^>]*>/g, '').trim()) missing.push(label);
      continue;
    }

    if (field.kind === 'media' || field.kind === 'mediaGallery' || field.kind === 'mediaList') {
      const list = parseJsonArray<MediaRef>(String(form.get(`__media:${field.name}`) ?? '')).filter((row) => row.mediaId);
      media[field.name] = list;
      if (field.required && !list.length) missing.push(label);
      continue;
    }

    if (field.kind === 'authors' || field.kind === 'people') {
      people[field.name] = parseJsonArray<PersonValue>(String(form.get(`__people:${field.name}`) ?? ''));
      continue;
    }

    if (field.kind === 'contentRef') {
      const list = field.many
        ? parseJsonArray<RefValue>(String(form.get(`__ref:${field.name}`) ?? ''))
        : (() => {
            const chosen = text(form, field.name);
            return chosen ? [{ detailId: chosen, groupId: '' }] : [];
          })();
      refs[field.name] = list.filter((row) => row.detailId);
      if (field.required && !refs[field.name].length) missing.push(label);
      continue;
    }

    if (field.kind === 'tags') {
      tagNames = splitTags(text(form, field.name));
      continue;
    }

    if (field.name === 'lang') continue;

    const value = scalarValue(field, form);
    if (field.name === 'isFeatured') {
      featured = value === true;
      continue;
    }
    if (field.required && isEmpty(field.kind, value)) missing.push(label);
    const column = ITEM_COLUMNS[field.name];
    if (column) itemData[column] = value;
    else detailData[field.name] = value;
  }

  if (missing.length) return { error: `${t('form.requiredField')}: ${missing.join(', ')}` };

  const title = String(itemData.title ?? '').trim();
  if (!title) return { error: `${t('form.requiredField')}: ${fieldLabel(locale, 'title')}` };

  const lang = existing?.lang ?? text(form, 'lang') ?? locale;
  const publishedAt = itemData.publishedAt ?? null;
  const rawSlug = String(itemData.slug ?? '').trim();
  itemData.slug = await uniqueSlug(prisma, lang, rawSlug ? slugify(rawSlug) : slugify(title), itemId);

  // ── workflow ──────────────────────────────────────────────────────────────────────────
  const canPublish = user.permissions.includes('*') || user.permissions.includes(`${def.key}.publish`);
  const previous = existing?.status ?? 'draft';
  const wasLive = previous === 'published' || previous === 'scheduled';
  let status = previous;
  let message = t('form.saved');

  if (intent === 'review') {
    status = 'in_review';
    message = t('form.submitted');
  } else if (intent === 'publish') {
    if (!canPublish) {
      status = 'in_review';
      message = t('form.noPublishRight');
    } else if (publishedAt instanceof Date && publishedAt.getTime() > Date.now()) {
      status = 'scheduled';
      message = t('form.scheduledNote');
    } else {
      status = 'published';
      message = t('form.publishedMsg');
    }
  } else if (!existing) {
    status = 'draft';
    message = t('form.created');
  } else if (intent === 'preview') {
    message = t('form.savedForPreview');
  } else if (!wasLive) {
    status = 'draft';
  }

  const detailModel = def.detailModel ?? '';
  const snapshot = (row: { title: string; subtitle: string | null; slug: string; excerpt: string | null; body: string | null; status: string }) => ({
    title: row.title,
    subtitle: row.subtitle,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    status: row.status,
  });
  const before = existing ? snapshot(existing) : null;

  const saved = await prisma.$transaction(async (tx) => {
    let groupId = existing?.groupId ?? '';
    if (!groupId) {
      const group = await tx.contentGroup.create({ data: { type: def.key, sourceLang: lang, isFeatured: featured ?? false, createdBy: user.id } });
      groupId = group.id;
    } else if (featured !== null && existing && featured !== existing.group.isFeatured) {
      await tx.contentGroup.update({ where: { id: groupId }, data: { isFeatured: featured } });
    }

    const delegate = detailModel ? detailDelegate(tx, detailModel) : null;
    const detail = delegate ? await delegate.findFirst({ where: { groupId } }) : null;

    const shared: Record<string, Column> = { ...itemData, lang };
    const item = existing
      ? await tx.contentItem.update({
          where: { id: existing.id },
          data: {
            ...shared,
            body: bodies.body ?? existing.body,
            status,
            revision: { increment: 1 },
            updatedById: user.id,
            publishedAt: status === 'published' && !publishedAt ? new Date() : publishedAt,
            scheduledAt: status === 'scheduled' ? publishedAt : null,
            submittedForReviewAt: status === 'in_review' ? new Date() : existing.submittedForReviewAt,
          } as Prisma.ContentItemUncheckedUpdateInput,
        })
      : await tx.contentItem.create({
          data: {
            groupId,
            origin: 'source',
            ...shared,
            body: bodies.body ?? null,
            status,
            revision: 1,
            authorId: itemData.authorId ?? user.id,
            updatedById: user.id,
            publishedAt: status === 'published' ? (publishedAt instanceof Date ? publishedAt : new Date()) : publishedAt,
            scheduledAt: status === 'scheduled' ? publishedAt : null,
            submittedForReviewAt: status === 'in_review' ? new Date() : null,
          } as Prisma.ContentItemUncheckedCreateInput,
        });

    if (delegate) {
      if (detail) await delegate.update({ where: { id: detail.id }, data: detailData });
      else await delegate.create({ data: { ...detailData, groupId } });
    }

    return { item, groupId, detailId: detail?.id ?? '' };
  });

  const { item, groupId } = saved;

  await prisma.$transaction(async (tx) => {
    if (detailModel && saved.detailId) {
      const delegate = detailDelegate(tx, detailModel);
      const mirror: Record<string, unknown> = {};
      for (const [field, list] of Object.entries(media)) {
        const column = MEDIA_OWNER_COLUMN[MEDIA_FIELD_ROLE[field] ?? ''];
        const first = list[0];
        if (column && first) mirror[column] = first.mediaId;
      }
      for (const field of def.fields) {
        if (field.kind === 'contentRef' && !field.many) mirror[field.name] = refs[field.name]?.[0]?.detailId ?? null;
      }
      if (Object.keys(mirror).length) await delegate.update({ where: { id: saved.detailId }, data: mirror });
    }

    const ogAssetId = await syncMedia(tx, groupId, media);
    if (def.fields.some((field) => field.name === 'ogImage')) {
      await tx.contentItem.update({ where: { id: item.id }, data: { ogImageAssetId: ogAssetId } });
    }

    await syncPeople(tx, { def, groupId, detailId: saved.detailId, people });
    await syncRefs(tx, { def, itemId: item.id, detailId: saved.detailId, refs });
    await syncTags(tx, item.id, lang, tagNames);

    const changed = existing && before ? [...diffFields(before, snapshot(item)), ...metaChanges(existing, item)] : null;
    await tx.contentRevision.create({
      data: {
        itemId: item.id,
        version: item.revision,
        changedById: user.id,
        changeSummary: changed
          ? changed.map((name) => fieldLabel(locale, name, name)).join(', ') || t('ver.nothingChanged')
          : t('form.created'),
        ...snapshot(item),
      },
    });

    if (before && before.slug !== item.slug) {
      await recordSlugRedirect(tx, { lang, typeKey: def.key, oldSlug: before.slug, newSlug: item.slug });
    }
  });

  await recordAudit({
    userId: user.id,
    action: existing ? 'content.update' : 'content.create',
    entityType: def.key,
    entityId: item.id,
    description: `${existing ? t('audit.updated') : t('audit.created')} · ${translate(locale, `type.${def.key}` as TranslationKey)} «${item.title}» → ${statusLabel(locale, status)}`,
    payload: { lang, slug: item.slug, status, revision: item.revision },
  });

  revalidatePath('/', 'layout');

  const savedAt = Date.now();
  if (intent === 'preview') {
    return existing
      ? { ok: message, open: adminPreviewPath(def.key, item.id), savedAt }
      : { ok: message, next: adminEditPath(def.key, item.id) };
  }
  if (!existing) return { ok: message, next: adminEditPath(def.key, item.id) };
  return { ok: message, savedAt };
}

// ── trash ─────────────────────────────────────────────────────────────────────────────────

/** Materials in the Trash keep their id, so a relative URL back to them is easy to validate. */
function itemBack(raw: string, typeKey: string, id: string): string {
  return raw.startsWith(`/admin/${typeKey}/${id}`) ? raw : adminEditPath(typeKey, id);
}

/**
 * Move to Trash. Nothing is removed from the database: the row stays with deletedAt set so it can
 * be restored, and the public site stops serving it.
 */
export async function trashMaterial(form: FormData): Promise<void> {
  const typeKey = text(form, 'type') ?? '';
  const id = text(form, 'id') ?? '';
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) return;

  const back = itemBack(text(form, 'back') ?? '', typeKey, id);
  const guard = await assertPermission(`${def.key}.delete`);
  if (!guard.ok) redirect(`${back}?trashed=denied`);

  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: null },
    select: { id: true, lang: true, title: true },
  });
  if (!item) redirect(`${back}?trashed=missing`);
  await prisma.contentItem.update({ where: { id: item.id }, data: { deletedAt: new Date(), updatedById: guard.user.id } });
  const locale = localeOf(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'content.trash',
    entityType: def.key,
    entityId: item.id,
    description: `${translate(locale, 'audit.trashed')} · ${translate(locale, `type.${def.key}` as TranslationKey)} «${item.title}» (${item.lang})`,
  });

  revalidatePath('/', 'layout');
  redirect(`${adminListPath(def.key)}?trashed=1`);
}

// ── versions ──────────────────────────────────────────────────────────────────────────────

/**
 * Roll a material back to an earlier snapshot. Nothing is lost: the text being replaced stays in
 * the version list, because restoring writes a new revision on top. Workflow status is untouched,
 * so reverting the wording of a published page does not silently take it offline.
 */
export async function restoreRevision(form: FormData): Promise<void> {
  const typeKey = text(form, 'type') ?? '';
  const id = text(form, 'id') ?? '';
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) return;

  const version = Number.parseInt(text(form, 'version') ?? '', 10);
  const back = itemBack(text(form, 'back') ?? '', typeKey, id);
  if (!Number.isInteger(version) || version < 1) redirect(`${back}/versions`);

  const guard = await assertPermission(`${def.key}.edit`);
  if (!guard.ok) redirect(`${back}?restored=denied`);

  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: null },
    select: { id: true, lang: true, title: true, slug: true },
  });
  if (!item) redirect(`${back}?restored=missing`);

  const snapshot = await prisma.contentRevision.findUnique({
    where: { itemId_version: { itemId: item.id, version } },
    select: { id: true, version: true, title: true, subtitle: true, slug: true, excerpt: true, body: true, changeSummary: true },
  });
  if (!snapshot) redirect(`${back}?restored=missing`);

  const locale = localeOf(guard.user.language);
  const summary = `${translate(locale, 'ver.restore')} v${snapshot.version}`;
  const slug = await uniqueSlug(prisma, item.lang, slugify(snapshot.slug), item.id);

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentItem.update({
      where: { id: item.id },
      data: {
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        slug,
        excerpt: snapshot.excerpt,
        body: snapshot.body ? sanitizeContentHtml(snapshot.body) : snapshot.body,
        revision: { increment: 1 },
        updatedById: guard.user.id,
      },
      select: { id: true, revision: true, status: true, title: true, slug: true },
    });

    await tx.contentRevision.create({
      data: {
        itemId: updated.id,
        version: updated.revision,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        slug,
        excerpt: snapshot.excerpt,
        body: snapshot.body,
        status: updated.status,
        changedById: guard.user.id,
        changeSummary: summary,
        restoredFrom: snapshot.version,
      },
    });

    if (item.slug !== slug) {
      await recordSlugRedirect(tx, { lang: item.lang, typeKey: def.key, oldSlug: item.slug, newSlug: slug });
    }
    return updated;
  });

  await recordAudit({
    userId: guard.user.id,
    action: 'content.revision.restore',
    entityType: def.key,
    entityId: item.id,
    description: `${translate(locale, 'audit.version')} v${snapshot.version} · «${item.title}»`,
    payload: { fromVersion: snapshot.version, revision: saved.revision },
  });

  revalidatePath('/', 'layout');
  redirect(`${back}?restored=${snapshot.version}`);
}

// ── bulk actions ──────────────────────────────────────────────────────────────────────────

/** Only a relative list URL of this same type may be returned to, so the form cannot redirect off-site. */
function backPath(form: FormData, typeKey: string): string {
  const raw = text(form, 'back') ?? '';
  return raw.startsWith(`/admin/${typeKey}?`) || raw.startsWith(`/admin/${typeKey}#`) ? raw : adminListPath(typeKey);
}

/** Declared as a function so TypeScript treats the redirect as end-of-control-flow for the caller. */
function bulkFail(back: string, reason: 'denied' | 'none'): never {
  redirect(`${back}${back.includes('?') ? '&' : '?'}bulk=${reason}`);
}

export async function bulkMaterialAction(form: FormData): Promise<void> {
  const typeKey = text(form, 'type') ?? '';
  const def = CONTENT_TYPE_MAP.get(typeKey);
  const raw = text(form, 'action') ?? '';
  if (!def || !isBulkAction(raw)) return;

  const back = backPath(form, def.key);

  const guard = await assertPermission(`${def.key}.${BULK_PERMISSION[raw]}`);
  if (!guard.ok) bulkFail(back, 'denied');
  const user = guard.user;
  const locale = localeOf(user.language);
  const actionLabel = translate(locale, `bulk.${raw}` as TranslationKey);

  const ids = [...new Set(form.getAll('ids').filter((value): value is string => typeof value === 'string' && value.length <= 40))].slice(0, BULK_LIMIT);
  if (!ids.length) bulkFail(back, 'none');

  const items = await prisma.contentItem.findMany({
    where: { id: { in: ids }, deletedAt: null, group: { type: def.key } },
    select: { id: true, groupId: true, title: true, lang: true, status: true },
  });
  if (!items.length) bulkFail(back, 'none');

  const action = raw;
  const tagName = action === 'addTag' ? text(form, 'tag') : null;
  if (action === 'addTag' && !tagName) bulkFail(back, 'none');

  let categoryId: string | null = null;
  if (action === 'moveCategory') {
    const wanted = text(form, 'categoryId');
    if (!wanted || !def.categoryScope || !def.detailModel) bulkFail(back, 'denied');
    const category = await prisma.category.findFirst({ where: { id: wanted, scope: def.categoryScope }, select: { id: true } });
    if (!category) bulkFail(back, 'denied');
    categoryId = category.id;
  }

  const now = new Date();
  const status = BULK_STATUS[action];

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      if (status) {
        const updated = await tx.contentItem.update({
          where: { id: item.id },
          data: {
            status,
            revision: { increment: 1 },
            updatedById: user.id,
            ...(action === 'publish'
              ? { publishedAt: item.status === 'published' ? undefined : now, scheduledAt: null, archivedAt: null, reviewedById: user.id, reviewedAt: now }
              : {}),
            ...(action === 'unpublish' ? { scheduledAt: null } : {}),
            ...(action === 'archive' ? { archivedAt: now, scheduledAt: null } : {}),
          } as Prisma.ContentItemUncheckedUpdateInput,
          select: { id: true, title: true, slug: true, excerpt: true, body: true, subtitle: true, revision: true, status: true },
        });

        await tx.contentRevision.create({
          data: {
            itemId: updated.id,
            version: updated.revision,
            title: updated.title,
            subtitle: updated.subtitle,
            slug: updated.slug,
            excerpt: updated.excerpt,
            body: updated.body,
            status: updated.status,
            changedById: user.id,
            changeSummary: actionLabel,
          },
        });
      } else if (action === 'trash') {
        await tx.contentItem.update({ where: { id: item.id }, data: { deletedAt: now, updatedById: user.id } });
      } else if (action === 'addTag' && tagName) {
        const slug = slugify(tagName);
        if (!slug) continue;
        const tag = await tx.tag.upsert({ where: { slug }, create: { slug }, update: {} });
        await tx.tagTranslation.upsert({
          where: { tagId_lang: { tagId: tag.id, lang: item.lang } },
          create: { tagId: tag.id, lang: item.lang, name: tagName },
          update: { name: tagName },
        });
        await tx.contentItemTag.upsert({
          where: { itemId_tagId: { itemId: item.id, tagId: tag.id } },
          create: { itemId: item.id, tagId: tag.id },
          update: {},
        });
      }
    }

    if (categoryId && def.detailModel) {
      const delegate = detailDelegate(tx, def.detailModel);
      await delegate.updateMany({ where: { groupId: { in: items.map((item) => item.groupId) } }, data: { categoryId } });
    }
  });

  for (const item of items) {
    await recordAudit({
      userId: user.id,
      action: `content.bulk.${action}`,
      entityType: def.key,
      entityId: item.id,
      description: `${actionLabel}: «${item.title}»`,
      payload: { count: items.length, status, categoryId },
    });
  }

  revalidatePath('/', 'layout');
  redirect(`${back}${back.includes('?') ? '&' : '?'}bulk=${action}&n=${items.length}`);
}
