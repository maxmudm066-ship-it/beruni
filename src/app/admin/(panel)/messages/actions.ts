'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate } from '@/lib/admin/labels';
import { isMessageStage, MESSAGE_STAGE_STATUSES, type MessageStage } from '@/lib/admin/messages';

const PERMISSION = 'contact_messages.manage';

function field(form: FormData, name: string, max = 60): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function returnTo(form: FormData, notice: string): never {
  const base = form.get('back');
  const path = typeof base === 'string' && base.startsWith('/admin/messages') ? base.slice(0, 300) : '/admin/messages';
  redirect(`${path}${path.includes('?') ? '&' : '?'}notice=${notice}`);
}

/**
 * Moves a message between New, Read, Answered and Archived. Nothing here sends mail: the panel only
 * records that a person has dealt with the enquiry, and who of them did it.
 */
export async function setMessageStage(form: FormData): Promise<void> {
  const id = field(form, 'id', 40);
  const rawStage = field(form, 'stage');
  if (!id || !isMessageStage(rawStage)) returnTo(form, 'missing');

  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) returnTo(form, 'denied');

  const message = await prisma.contactMessage.findUnique({
    where: { id },
    select: { id: true, stage: true, name: true },
  });
  if (!message) returnTo(form, 'missing');
  if (message.stage === rawStage) returnTo(form, 'marked');

  const stage = rawStage as MessageStage;
  await prisma.contactMessage.update({ where: { id }, data: { stage, handledById: guard.user.id } });

  const locale = localeOf(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'contact_messages.stage',
    entityType: 'ContactMessage',
    entityId: id,
    description: `${translate(locale, 'audit.messagesStage')} · ${translate(locale, MESSAGE_STAGE_STATUSES[stage])}`,
  });

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${id}`);
  returnTo(form, 'marked');
}
