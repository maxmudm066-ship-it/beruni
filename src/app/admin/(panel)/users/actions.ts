'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { ADMIN_LOCALES, actorLocale } from '@/lib/admin/i18n';
import { localeOf, translate, type TranslationKey } from '@/lib/admin/labels';
import type { ActionState } from '@/lib/admin/action-state';

const USER_PERMISSION = 'users.manage';

const emailSchema = z.string().trim().email('form.invalidEmail');
const usernameSchema = z
  .string()
  .trim()
  .min(3, 'form.usernameFormat')
  .max(40, 'form.usernameFormat')
  .regex(/^[a-z0-9._-]+$/, 'form.usernameFormat');

const createSchema = z.object({
  displayName: z.string().trim().min(2, 'form.nameTooShort').max(120),
  email: emailSchema,
  username: usernameSchema,
  roleId: z.string().min(1, 'error.chooseRole'),
  language: z.enum(ADMIN_LOCALES),
  password: z.string().min(10, 'error.passwordTooShort'),
});

const updateSchema = z.object({
  displayName: z.string().trim().min(2, 'form.nameTooShort').max(120),
  email: emailSchema,
  username: usernameSchema,
  roleId: z.string().min(1, 'error.chooseRole'),
  language: z.enum(ADMIN_LOCALES),
  status: z.enum(['active', 'invited', 'suspended']),
});

/** Validation replies are dictionary keys, so a bad form still answers in the person's language. */
const FIELD_MESSAGES: readonly string[] = [
  'form.invalidEmail',
  'form.nameTooShort',
  'form.usernameFormat',
  'error.chooseRole',
  'error.passwordTooShort',
];

function firstIssue(error: z.ZodError, t: (key: TranslationKey) => string): string {
  const message = error.issues[0]?.message ?? '';
  return FIELD_MESSAGES.includes(message) ? t(message as TranslationKey) : t('form.checkValues');
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await assertPermission(USER_PERMISSION);
  if (!guard.ok) return { error: guard.error };

  const locale = await actorLocale(guard.user.language);
  const t = (key: TranslationKey) => translate(locale, key);

  const parsed = createSchema.safeParse({
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    username: formData.get('username'),
    roleId: formData.get('roleId'),
    language: formData.get('language'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error, t) };

  const data = parsed.data;
  const email = data.email.toLowerCase();

  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { username: data.username }] },
    select: { email: true, username: true },
  });
  if (clash) return { error: clash.email === email ? t('error.emailTaken') : t('error.usernameTaken') };

  const created = await prisma.user.create({
    data: {
      displayName: data.displayName,
      email,
      username: data.username,
      roleId: data.roleId,
      language: data.language,
      status: 'invited',
      passwordHash: await hashPassword(data.password),
      // They set their own password the first time they sign in.
      mustChangePassword: true,
    },
  });

  await recordAudit({
    userId: guard.user.id,
    action: 'user.create',
    entityType: 'user',
    entityId: created.id,
    description: `${translate(localeOf(guard.user.language), 'audit.accountCreated')} · ${created.displayName}`,
    payload: { email: created.email, role: data.roleId },
  });

  redirect('/admin/users');
}

export async function updateUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await assertPermission(USER_PERMISSION);
  if (!guard.ok) return { error: guard.error };

  const locale = await actorLocale(guard.user.language);
  const t = (key: TranslationKey) => translate(locale, key);

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return { error: t('error.noAccountChosen') };

  const parsed = updateSchema.safeParse({
    displayName: formData.get('displayName'),
    email: formData.get('email'),
    username: formData.get('username'),
    roleId: formData.get('roleId'),
    language: formData.get('language'),
    status: formData.get('status'),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error, t) };

  const data = parsed.data;
  const email = data.email.toLowerCase();

  const clash = await prisma.user.findFirst({
    where: { AND: [{ id: { not: userId } }, { OR: [{ email }, { username: data.username }] }] },
    select: { email: true },
  });
  if (clash) return { error: clash.email === email ? t('error.emailTaken') : t('error.usernameTaken') };

  const target = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) return { error: t('error.userNotFound') };

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) return { error: t('error.chooseRole') };

  if (target.id === guard.user.id) {
    return { error: t('users.selfEdit') };
  }

  // The panel must never end up with no way to manage itself.
  if (target.role.key === 'super_admin' && (role.key !== 'super_admin' || data.status !== 'active')) {
    const remaining = await prisma.user.count({
      where: { role: { key: 'super_admin' }, status: 'active', id: { not: userId } },
    });
    if (remaining === 0) {
      return { error: t('error.lastSuperAdmin') };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: data.displayName,
      email,
      username: data.username,
      roleId: data.roleId,
      language: data.language,
      status: data.status,
    },
  });

  await recordAudit({
    userId: guard.user.id,
    action: 'user.update',
    entityType: 'user',
    entityId: userId,
    description: `${translate(localeOf(guard.user.language), 'audit.accountUpdated')} · ${data.displayName}`,
    payload: { role: role.key, status: data.status },
  });

  revalidatePath('/admin/users');
  return { ok: t('common.saved') };
}

const passwordSchema = z.object({ password: z.string().min(10) });

export async function resetUserPassword(formData: FormData): Promise<void> {
  const guard = await assertPermission(USER_PERMISSION);
  if (!guard.ok) return;

  const userId = String(formData.get('userId') ?? '');
  const parsed = passwordSchema.safeParse({ password: formData.get('password') });
  if (!userId || !parsed.success) return;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true } });
  if (!target) return;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(parsed.data.password), mustChangePassword: true },
  });
  // Force the person to sign in again with the new password.
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  await recordAudit({
    userId: guard.user.id,
    action: 'user.password.reset',
    entityType: 'user',
    entityId: userId,
    description: `${translate(localeOf(guard.user.language), 'audit.accountPasswordReset')} · ${target.displayName}`,
  });

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
}

export async function unlockAccount(formData: FormData): Promise<void> {
  const guard = await assertPermission(USER_PERMISSION);
  if (!guard.ok) return;

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;

  await prisma.user.update({ where: { id: userId }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await recordAudit({
    userId: guard.user.id,
    action: 'user.unlock',
    entityType: 'user',
    entityId: userId,
    description: translate(localeOf(guard.user.language), 'audit.accountUnlocked'),
  });
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
}

/** Clears 2FA so a person who lost their phone can sign in again and set it up afresh. */
export async function resetTwoFactor(formData: FormData): Promise<void> {
  const guard = await assertPermission(USER_PERMISSION);
  if (!guard.ok) return;

  const userId = String(formData.get('userId') ?? '');
  if (!userId) return;

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit({
    userId: guard.user.id,
    action: 'user.2fa.reset',
    entityType: 'user',
    entityId: userId,
    description: translate(localeOf(guard.user.language), 'audit.twoFactorReset'),
  });
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
}
