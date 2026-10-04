/**
 * The two things the Trash screen can do with a material: bring it back, or remove it for good.
 * Both act only on rows already carrying deletedAt, so nothing can be purged straight from a list.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermissions } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate } from '@/lib/admin/labels';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';

function field(form: FormData, name: string): string {
  const raw = form.get(name);
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 60);
}

/** Only a Trash URL of this same site may be returned to, so a crafted form cannot redirect off-site. */
function returnTo(form: FormData, notice: string, value: string): never {
  const base = form.get('back');
  const path = typeof base === 'string' && base.startsWith('/admin/trash') ? base.slice(0, 300) : '/admin/trash';
  redirect(`${path}${path.includes('?') ? '&' : '?'}${notice}=${value}`);
}

export async function restoreMaterial(form: FormData): Promise<void> {
  const typeKey = field(form, 'type');
  const id = field(form, 'id');
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) returnTo(form, 'restored', 'missing');

  // trash.manage covers every type; otherwise the editor of this type may undo their own deletion.
  const guard = await assertPermissions(['trash.manage', `${def.key}.edit`]);
  if (!guard.ok) returnTo(form, 'restored', 'denied');

  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: { not: null } },
    select: { id: true, lang: true, title: true },
  });
  if (!item) returnTo(form, 'restored', 'missing');

  await prisma.contentItem.update({
    where: { id: item.id },
    data: { deletedAt: null, updatedById: guard.user.id },
  });
  await recordAudit({
    userId: guard.user.id,
    action: 'content.restore',
    entityType: def.key,
    entityId: item.id,
    description: `${translate(localeOf(guard.user.language), 'audit.restored')} «${item.title}» (${item.lang})`,
  });

  revalidatePath('/', 'layout');
  returnTo(form, 'restored', item.id);
}

/**
 * Permanent deletion. Media Library files are referenced by asset id and are not owned by the
 * material, so they survive; everything the material itself created cascades.
 */
export async function deleteMaterialPermanently(form: FormData): Promise<void> {
  const typeKey = field(form, 'type');
  const id = field(form, 'id');
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) returnTo(form, 'deleted', 'missing');

  const guard = await assertPermissions(['trash.manage']);
  if (!guard.ok) returnTo(form, 'deleted', 'denied');

  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: { not: null } },
    include: { group: { select: { id: true, items: { select: { id: true } } } } },
  });
  if (!item) returnTo(form, 'deleted', 'missing');

  const title = item.title;
  const lastVersion = item.group.items.length <= 1;

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.delete({ where: { id: item.id } });
    // The shared detail row has no meaning without a language version, so the group goes with the last one.
    if (lastVersion) await tx.contentGroup.delete({ where: { id: item.groupId } });
  });

  await recordAudit({
    userId: guard.user.id,
    action: 'content.delete',
    entityType: def.key,
    entityId: item.id,
    description: `${translate(localeOf(guard.user.language), 'audit.deleted')} «${title}» (${item.lang})`,
    payload: { groupRemoved: lastVersion },
  });

  revalidatePath('/', 'layout');
  returnTo(form, 'deleted', item.id);
}
