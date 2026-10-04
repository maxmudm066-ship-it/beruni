/**
 * Starting a language version of an existing material.
 *
 * Nothing is translated by the machine: the new draft holds the text of the original language so
 * that an editor replaces it term by term. That is why the button says "add version" and not
 * "translate", and why the editor lands on the form instead of on a finished page.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermissions } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { localeOf, translate } from '@/lib/admin/labels';
import { adminEditPath } from '@/lib/content/routes';
import { slugify } from '@/lib/slug';
import { uniqueSlug } from '@/lib/content/unique-slug';

/** Only a relative URL of this screen may be returned to, so the form cannot redirect off-site. */
function returnTo(form: FormData, notice: string): never {
  const raw = typeof form.get('back') === 'string' ? (form.get('back') as string) : '';
  const path = raw.startsWith('/admin/translations') ? raw.slice(0, 300) : '/admin/translations';
  const separator = path.includes('?') ? '&' : '?';
  redirect(`${path}${separator}added=${notice}`);
}

export async function addTranslationVersion(form: FormData): Promise<void> {
  const groupId = typeof form.get('group') === 'string' ? (form.get('group') as string).trim() : '';
  const lang = typeof form.get('lang') === 'string' ? (form.get('lang') as string).trim().toLowerCase() : '';
  if (!groupId || !/^[a-z]{2}$/.test(lang)) returnTo(form, 'missing');

  const group = await prisma.contentGroup.findFirst({
    where: { id: groupId, deletedAt: null },
    select: {
      id: true,
      type: true,
      sourceLang: true,
      isFeatured: true,
      items: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'asc' }],
        select: { id: true, lang: true, status: true },
      },
    },
  });
  const def = group ? CONTENT_TYPE_MAP.get(group.type) : undefined;
  if (!group || !def) returnTo(form, 'missing');
  if (group.items.some((item) => item.lang === lang)) returnTo(form, 'exists');

  const guard = await assertPermissions(['translations.edit', `${def.key}.create`]);
  if (!guard.ok) returnTo(form, 'denied');

  const language = await prisma.language.findFirst({ where: { code: lang, isActive: true }, select: { code: true } });
  if (!language) returnTo(form, 'missing');

  const source = await prisma.contentItem.findFirst({
    where: { groupId: group.id, deletedAt: null, lang: group.sourceLang },
    orderBy: { createdAt: 'asc' },
  });
  if (!source) returnTo(form, 'missing');

  const slug = await uniqueSlug(prisma, lang, slugify(source.slug) || slugify(source.title) || 'material', null);
  const locale = localeOf(guard.user.language);
  const summary = `${translate(locale, 'trans.started')} · ${source.lang.toUpperCase()}`;

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.create({
      data: {
        groupId: group.id,
        lang,
        title: source.title,
        subtitle: source.subtitle,
        slug,
        excerpt: source.excerpt,
        body: source.body,
        status: 'draft',
        revision: 1,
        origin: 'translation',
        authorId: source.authorId ?? guard.user.id,
        updatedById: guard.user.id,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        keywords: source.keywords,
        ogTitle: source.ogTitle,
        ogDescription: source.ogDescription,
      },
      select: { id: true, lang: true, title: true, subtitle: true, slug: true, excerpt: true, body: true, status: true, revision: true },
    });

    await tx.contentRevision.create({
      data: {
        itemId: item.id,
        version: 1,
        title: item.title,
        subtitle: item.subtitle,
        slug,
        excerpt: item.excerpt,
        body: item.body,
        status: item.status,
        changedById: guard.user.id,
        changeSummary: summary,
      },
    });

    return item;
  });

  await recordAudit({
    userId: guard.user.id,
    action: 'content.translation.create',
    entityType: def.key,
    entityId: created.id,
    description: `${translate(locale, 'audit.translation')} «${created.title}» (${source.lang} → ${created.lang})`,
    payload: { groupId: group.id, sourceItemId: source.id, lang },
  });

  revalidatePath('/', 'layout');
  redirect(`${adminEditPath(def.key, created.id)}?translation=1`);
}
