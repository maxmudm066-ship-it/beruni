/**
 * SEO-by-address writes. One row holds the settings of one address in one language, every screen
 * here is a plain form post, and an empty field means "the page itself decides" — which is what a
 * content manager expects from a screen that overrides nothing until they type something.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import {
  SEO_CANONICAL_MAX,
  SEO_DESCRIPTION_MAX,
  SEO_KEYWORDS_MAX,
  SEO_PATH_MAX,
  SEO_TITLE_MAX,
  readCanonical,
  readRouteAddress,
  type SeoProblem,
} from '@/lib/admin/seo-address';
import { siteLanguages } from '@/lib/site/languages';

const WRITE = 'seo.edit';
const SCREEN = '/admin/seo';

function text(form: FormData, name: string, max: number): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function flag(form: FormData, name: string): boolean {
  const raw = form.get(name);
  return raw === 'on' || raw === 'true' || raw === '1';
}

/** Only a screen of this panel may be returned to, so a crafted form cannot send the user elsewhere. */
function backTo(form: FormData, notice: string): never {
  const raw = form.get('back');
  const path = typeof raw === 'string' && raw.startsWith(SCREEN) ? raw.slice(0, 300) : SCREEN;
  redirect(`${path}${path.includes('?') ? '&' : '?'}${notice}`);
}

const DRAFT_FIELDS: { name: string; max: number }[] = [
  { name: 'lang', max: 12 },
  { name: 'path', max: SEO_PATH_MAX },
  { name: 'title', max: SEO_TITLE_MAX },
  { name: 'description', max: SEO_DESCRIPTION_MAX },
  { name: 'keywords', max: SEO_KEYWORDS_MAX },
  { name: 'canonical', max: SEO_CANONICAL_MAX },
  { name: 'ogTitle', max: SEO_TITLE_MAX },
  { name: 'ogDescription', max: SEO_DESCRIPTION_MAX },
];

/**
 * What a person typed travels back in the address bar so a refused value is not lost. The picture is
 * the one field that stays out: it is named by a library id, and an id does not belong in a URL a
 * content manager can read.
 */
function draftQuery(form: FormData, problem: SeoProblem, editingId: string): string {
  const params = new URLSearchParams();
  params.set('bad', problem);
  for (const field of DRAFT_FIELDS) {
    const value = text(form, field.name, field.max);
    if (value) params.set(`d_${field.name}`, value);
  }
  if (editingId) params.set('edit', editingId);
  return params.toString();
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: Parameters<typeof translate>[1]) => translate(locale, key);
}

/** The values of a form, checked. Nothing is stored before every one of them is right. */
async function readForm(form: FormData) {
  const address = readRouteAddress(text(form, 'path', SEO_PATH_MAX));
  if (!address.ok) return { ok: false as const, problem: address.problem };

  const language = text(form, 'lang', 12);
  const codes = await siteLanguages();
  if (!codes.some((entry) => entry.code === language)) return { ok: false as const, problem: 'unknownLanguage' as const };

  const canonical = readCanonical(text(form, 'canonical', SEO_CANONICAL_MAX));
  if (!canonical.ok) return { ok: false as const, problem: canonical.problem };

  const image = text(form, 'ogImage', 40);
  if (image) {
    const found = await prisma.media.findFirst({ where: { id: image, kind: 'image' }, select: { id: true } });
    if (!found) return { ok: false as const, problem: 'badImage' as const };
  }

  return {
    ok: true as const,
    data: {
      lang: language,
      routePath: address.path,
      title: text(form, 'title', SEO_TITLE_MAX) || null,
      description: text(form, 'description', SEO_DESCRIPTION_MAX) || null,
      keywords: text(form, 'keywords', SEO_KEYWORDS_MAX) || null,
      canonicalUrl: canonical.value,
      ogTitle: text(form, 'ogTitle', SEO_TITLE_MAX) || null,
      ogDescription: text(form, 'ogDescription', SEO_DESCRIPTION_MAX) || null,
      ogImageAssetId: image || null,
      noIndex: flag(form, 'noIndex'),
    },
  };
}

export async function saveRouteSeo(form: FormData): Promise<void> {
  const guard = await assertPermission(WRITE);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, 'notice=denied');

  const read = await readForm(form);
  if (!read.ok) backTo(form, draftQuery(form, read.problem, id));

  const data = read.data;
  const t = auditFor(guard.user.language);

  if (id) {
    const existing = await prisma.routeSeo.findUnique({ where: { id }, select: { id: true } });
    if (!existing) backTo(form, 'notice=missing');

    const taken = await prisma.routeSeo.findFirst({
      where: { lang: data.lang, routePath: data.routePath, NOT: { id } },
      select: { id: true },
    });
    if (taken) backTo(form, 'notice=exists');

    await prisma.routeSeo.update({ where: { id }, data });
    await recordAudit({
      userId: guard.user.id,
      action: 'routeSeo.update',
      entityType: 'RouteSeo',
      entityId: id,
      description: `${t('audit.routeSeoSaved')} · ${data.lang}:${data.routePath}`,
      payload: { title: data.title, description: data.description, noIndex: data.noIndex },
    });
    revalidatePath('/', 'layout');
    backTo(form, 'notice=saved');
  }

  const existing = await prisma.routeSeo.findUnique({
    where: { lang_routePath: { lang: data.lang, routePath: data.routePath } },
    select: { id: true },
  });
  if (existing) backTo(form, 'notice=exists');

  const created = await prisma.routeSeo.create({ data });
  await recordAudit({
    userId: guard.user.id,
    action: 'routeSeo.create',
    entityType: 'RouteSeo',
    entityId: created.id,
    description: `${t('audit.routeSeoCreated')} · ${created.lang}:${created.routePath}`,
    payload: { title: created.title, noIndex: created.noIndex },
  });
  revalidatePath('/', 'layout');
  backTo(form, 'notice=created');
}

export async function deleteRouteSeo(form: FormData): Promise<void> {
  const guard = await assertPermission(WRITE);
  const id = text(form, 'id', 40);
  if (!guard.ok || !id) backTo(form, 'notice=denied');

  const row = await prisma.routeSeo.findUnique({ where: { id }, select: { id: true, lang: true, routePath: true } });
  if (!row) backTo(form, 'notice=missing');

  await prisma.routeSeo.delete({ where: { id } });
  await recordAudit({
    userId: guard.user.id,
    action: 'routeSeo.delete',
    entityType: 'RouteSeo',
    entityId: id,
    description: `${auditFor(guard.user.language)('audit.routeSeoDeleted')} · ${row.lang}:${row.routePath}`,
  });
  revalidatePath('/', 'layout');
  backTo(form, 'notice=deleted');
}
