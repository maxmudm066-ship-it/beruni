'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { newTotpSecret, verifyTotp } from '@/lib/auth/totp';
import { recordAudit } from '@/lib/auth/audit';
import { actorLocale } from '@/lib/admin/i18n';
import { localeOf, translate, type TranslationKey } from '@/lib/admin/labels';
import type { ActionState } from '@/lib/admin/action-state';

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/**
 * Generates a setup key and parks it on the account. Two-factor only becomes mandatory
 * once the owner proves they can produce a code, so an abandoned setup cannot lock anyone out.
 */
export async function startTwoFactor(): Promise<void> {
  const user = await requireUser();
  if (user.twoFactorEnabled) redirect('/admin/security');

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: newTotpSecret() } });
  revalidatePath('/admin/security');
  redirect('/admin/security/setup');
}

export async function cancelTwoFactorSetup(): Promise<void> {
  const user = await requireUser();
  if (!user.twoFactorEnabled) {
    await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: null } });
  }
  revalidatePath('/admin/security');
  redirect('/admin/security');
}

export async function confirmTwoFactorSetup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const locale = await actorLocale(user.language);
  const t = (key: TranslationKey) => translate(locale, key);
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true, email: true },
  });
  if (!account?.twoFactorSecret) return { error: t('security.expired'), next: '/admin/security' };

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { error: t('twoFactor.hint') };

  if (!(await verifyTotp(parsed.data.code, account.twoFactorSecret))) {
    await recordAudit({
      userId: user.id,
      action: 'two_factor.setup_failed',
      entityType: 'user',
      entityId: user.id,
      description: translate(localeOf(user.language), 'audit.twoFactorWrongSetup'),
    });
    return { error: t('security.badCode') };
  }

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  await recordAudit({
    userId: user.id,
    action: 'two_factor.enable',
    entityType: 'user',
    entityId: user.id,
    description: translate(localeOf(user.language), 'audit.twoFactorOn'),
  });

  revalidatePath('/admin/security');
  redirect('/admin/security?enabled=1');
}

/** Turning protection off costs a live code, so a stolen form post cannot strip it silently. */
export async function disableTwoFactor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const locale = await actorLocale(user.language);
  const t = (key: TranslationKey) => translate(locale, key);
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true },
  });
  if (!account?.twoFactorSecret) return { error: t('error.twoFactorNotEnabled') };

  const parsed = codeSchema.safeParse({ code: formData.get('code') });
  if (!parsed.success) return { error: t('twoFactor.hint') };

  if (!(await verifyTotp(parsed.data.code, account.twoFactorSecret))) {
    await recordAudit({
      userId: user.id,
      action: 'two_factor.disable_failed',
      entityType: 'user',
      entityId: user.id,
      description: translate(localeOf(user.language), 'audit.twoFactorWrongDisable'),
    });
    return { error: t('security.badCode') };
  }

  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  await recordAudit({
    userId: user.id,
    action: 'two_factor.disable',
    entityType: 'user',
    entityId: user.id,
    description: translate(localeOf(user.language), 'audit.twoFactorOff'),
  });

  revalidatePath('/admin/security');
  return { ok: t('security.disabled') };
}
