/**
 * The review queue behind the Workflow requirement: Draft → In Review → Approved → Published.
 * A decision only moves an item that is actually waiting, and every move leaves a revision
 * snapshot plus an audit entry, so an author can see who approved their text and when.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { assertPermissions } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { ADMIN_LOCALES, translate, type AdminLocale } from '@/lib/admin/labels';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { slugify } from '@/lib/slug';

const DECISIONS = {
  approve: { status: 'approved', permission: 'review' },
  reject: { status: 'draft', permission: 'review' },
  publish: { status: 'published', permission: 'publish' },
} as const;

type Decision = keyof typeof DECISIONS;

function field(form: FormData, name: string, max = 60): string {
  const raw = form.get(name);
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, max);
}

function returnTo(form: FormData, value: string): never {
  const base = form.get('back');
  const path = typeof base === 'string' && base.startsWith('/admin/reviews') ? base.slice(0, 300) : '/admin/reviews';
  redirect(`${path}${path.includes('?') ? '&' : '?'}decision=${value}`);
}

function localeOf(language: string): AdminLocale {
  return (ADMIN_LOCALES as readonly string[]).includes(language) ? (language as AdminLocale) : 'ru';
}

export async function reviewDecision(form: FormData): Promise<void> {
  const typeKey = field(form, 'type');
  const id = field(form, 'id');
  const rawDecision = field(form, 'decision');
  const def = CONTENT_TYPE_MAP.get(typeKey);
  const decision = rawDecision as Decision;
  if (!def || !(decision in DECISIONS)) return;

  const guard = await assertPermissions([`${def.key}.${DECISIONS[decision].permission}`, `${def.key}.publish`]);
  if (!guard.ok) returnTo(form, 'denied');

  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: null },
    select: { id: true, title: true, slug: true, lang: true, status: true, revision: true, publishedAt: true },
  });
  // Only material that is waiting can be decided on; published text is edited, not approved again.
  if (!item || (item.status !== 'in_review' && item.status !== 'approved')) returnTo(form, 'missing');

  const locale = localeOf(guard.user.language);
  const summary = translate(locale, `review.${decision}`);
  const now = new Date();

  const rejectReason = decision === 'reject' ? field(form, 'reason', 500) : '';
  // A rejection without notes tells the author nothing, so the queue requires them.
  if (decision === 'reject' && !rejectReason) returnTo(form, 'reason');

  const status =
    decision === 'publish' && item.publishedAt instanceof Date && item.publishedAt.getTime() > now.getTime()
      ? 'scheduled'
      : DECISIONS[decision].status;

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentItem.update({
      where: { id: item.id },
      data: {
        status,
        revision: { increment: 1 },
        updatedById: guard.user.id,
        reviewedById: guard.user.id,
        reviewedAt: now,
        rejectReason: decision === 'reject' ? rejectReason : null,
        ...(decision === 'publish'
          ? { publishedAt: item.publishedAt ?? now, scheduledAt: status === 'scheduled' ? item.publishedAt : null, archivedAt: null }
          : {}),
        ...(decision === 'approve' ? { scheduledAt: null } : {}),
      } as Prisma.ContentItemUncheckedUpdateInput,
      select: { id: true, title: true, subtitle: true, slug: true, excerpt: true, body: true, status: true, revision: true },
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
        changedById: guard.user.id,
        changeSummary: summary,
      },
    });

    return updated;
  });

  await recordAudit({
    userId: guard.user.id,
    action: `content.${decision}`,
    entityType: def.key,
    entityId: item.id,
    description: `${summary}: «${item.title}»${rejectReason ? ` — ${rejectReason}` : ''}`,
    payload: { from: item.status, to: saved.status, slug: slugify(saved.slug) },
  });

  revalidatePath('/', 'layout');
  returnTo(form, decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'published');
}
