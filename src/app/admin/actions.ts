'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { checkLoginAllowed, recordFailedLogin, recordSuccessfulLogin } from '@/lib/auth/login-guard';
import { endAllSessions, endSession, getSessionUser, startSession } from '@/lib/auth/session';
import { PENDING_COOKIE, PENDING_MAX_AGE_SECONDS, readPendingTicket, signPendingTicket } from '@/lib/auth/pending';
import { verifyTotp } from '@/lib/auth/totp';
import { recordAudit } from '@/lib/auth/audit';
import { ADMIN_LOCALE_COOKIE, actorLocale, getAdminLocale, isAdminLocale } from '@/lib/admin/i18n';
import { localeOf, translate, type TranslationKey } from '@/lib/admin/labels';
import type { ActionState } from '@/lib/admin/action-state';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

async function clientIp(): Promise<string> {
  const agent = await headers();
  return agent.get('x-forwarded-for')?.split(',')[0].trim() ?? agent.get('x-real-ip') ?? 'local';
}

/** A wrong address and a wrong password must answer identically, so the reply is one fixed key. */
const GENERIC_FAILURE: TranslationKey = 'error.badCredentials';

/** Only ever a path inside the admin area — blocks open-redirect via the `next` field. */
function safeAdminPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/admin') || value.startsWith('//')) return null;
  const [pathname, query] = value.split('?');
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) return null;
  return query ? `${pathname}?${query}` : pathname;
}

function landingPath(formData: FormData, user: { mustChangePassword: boolean }): string {
  if (user.mustChangePassword) return '/admin/change-password';
  return safeAdminPath(formData.get('next')) ?? '/admin';
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Before a session exists the only language signal is the cookie the switcher on this screen sets.
  const locale = await getAdminLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: t('error.signInFields') };

  const { email, password } = parsed.data;
  const ip = await clientIp();

  const gate = await checkLoginAllowed(email, ip);
  if (!gate.allowed) return { error: t(gate.reason ?? GENERIC_FAILURE) };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Always run a bcrypt comparison so a missing account and a wrong password take the same time.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const passwordOk = await verifyPassword(password, hash);

  if (!user || !passwordOk) {
    await recordFailedLogin(email, ip, user?.id ?? null);
    return { error: t(GENERIC_FAILURE) };
  }

  if (user.status === 'suspended') {
    await recordFailedLogin(email, ip, user.id);
    return { error: t('error.accountSuspended') };
  }

  if (user.twoFactorEnabled) {
    if (!user.twoFactorSecret) return { error: t('error.twoFactorNotSetUp') };
    const store = await cookies();
    store.set(PENDING_COOKIE, signPendingTicket(user.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/admin',
      maxAge: PENDING_MAX_AGE_SECONDS,
    });
    redirect('/admin/login/verify');
  }

  await startSession(user.id, false);
  await recordSuccessfulLogin(email, ip, user.id);
  await recordAudit({
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    description: translate(localeOf(user.language), 'audit.signedIn'),
  });

  // Redirect here rather than handing the path to the client: the login page itself sends
  // any valid session to /admin, and that server-side redirect would otherwise win the race
  // and skip a mandatory password change or the page the user was actually headed to.
  redirect(landingPath(formData, user));
}

const totpSchema = z.object({ token: z.string().trim().regex(/^\d{6}$/) });

export async function confirmTwoFactor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const store = await cookies();
  const pending = readPendingTicket(store.get(PENDING_COOKIE)?.value);
  if (!pending) redirect('/admin/login?expired=1');

  // The language picked on the sign-in screen wins here: the visitor has not proved who they are yet,
  // so the account's saved preference must not overrule the choice they just made.
  const locale = await getAdminLocale();
  const t = (key: TranslationKey) => translate(locale, key);

  const parsed = totpSchema.safeParse({ token: formData.get('token') });
  if (!parsed.success) return { error: t('twoFactor.hint') };

  const user = await prisma.user.findUnique({ where: { id: pending } });
  if (!user?.twoFactorSecret || user.status === 'suspended') {
    return { error: t('error.sessionExpired'), next: '/admin/login' };
  }

  const ok = await verifyTotp(parsed.data.token, user.twoFactorSecret);
  if (!ok) {
    await recordFailedLogin(user.email, await clientIp(), user.id);
    return { error: t('error.codeInvalid') };
  }

  store.delete(PENDING_COOKIE);
  await startSession(user.id, true);
  await recordSuccessfulLogin(user.email, await clientIp(), user.id);
  await recordAudit({
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    description: translate(localeOf(user.language), 'audit.signedIn2fa'),
  });

  redirect(landingPath(formData, user));
}

export async function signOut(): Promise<void> {
  const user = await getSessionUser();
  await endSession();
  if (user) {
    await recordAudit({
      userId: user.id,
      action: 'logout',
      entityType: 'user',
      entityId: user.id,
      description: translate(localeOf(user.language), 'audit.signedOut'),
    });
  }
  redirect('/admin/login?signedOut=1');
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { error: translate(await getAdminLocale(), 'error.sessionExpired') };
  const locale = await actorLocale(user.language);
  const t = (key: TranslationKey) => translate(locale, key);

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (next !== confirm) return { error: t('error.passwordMismatch') };
  if (next.length < 10) return { error: t('error.passwordTooShort') };
  if (!/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/[0-9]/.test(next)) {
    return { error: t('error.passwordTooWeak') };
  }

  const account = await prisma.user.findUnique({ where: { id: user.id } });
  if (!account || !(await verifyPassword(current, account.passwordHash))) {
    return { error: t('error.currentPasswordWrong') };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // Keep this session alive, drop every other one.
  await endAllSessions(user.id, user.sessionId);
  await recordAudit({
    userId: user.id,
    action: 'password.change',
    entityType: 'user',
    entityId: user.id,
    description: translate(localeOf(user.language), 'audit.passwordChanged'),
  });

  return { next: '/admin' };
}

export async function revokeAllOtherSessions(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const count = await endAllSessions(user.id, user.sessionId);
  await recordAudit({
    userId: user.id,
    action: 'sessions.revoke',
    entityType: 'user',
    entityId: user.id,
    description: `${translate(localeOf(user.language), 'audit.sessionsRevoked')}: ${count}`,
  });
  revalidatePath('/admin/sessions');
}

export async function setAdminLocale(formData: FormData): Promise<void> {
  const locale = formData.get('locale');
  if (!isAdminLocale(locale)) return;
  const store = await cookies();
  store.set(ADMIN_LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  const user = await getSessionUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { language: locale } });
  revalidatePath('/admin');
}

/** Ends one of the signed-in user's own sessions, never somebody else's. */
export async function revokeSession(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId || sessionId === user.sessionId) return;

  await prisma.session.updateMany({
    where: { id: sessionId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    userId: user.id,
    action: 'session.revoke',
    entityType: 'session',
    entityId: sessionId,
    description: translate(localeOf(user.language), 'audit.sessionRevoked'),
  });
  revalidatePath('/admin/sessions');
}
