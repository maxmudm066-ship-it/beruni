import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { actorLocale, getAdminLocale } from '@/lib/admin/i18n';
import { translate } from '@/lib/admin/labels';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { generateToken, hashToken } from './password';

export const SESSION_COOKIE = 'beruni_admin_session';

/** 'suspended' accounts are locked out; a person invited by an admin can already sign in. */
const SIGN_IN_STATUSES: readonly string[] = ['active', 'invited'];

const FALLBACK_TTL_MINUTES = 480;

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  language: string;
  status: string;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
  sessionId: string;
}

async function sessionTtlMinutes(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { group_key: { group: 'security', key: 'session_timeout_minutes' } },
  });
  const parsed = Number.parseInt(setting?.value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_TTL_MINUTES;
}

function toSessionUser(user: UserWithRole, sessionId: string): SessionUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    language: user.language,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
    roleId: user.role.id,
    roleKey: user.role.key,
    roleName: user.role.name,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
    sessionId,
  };
}

/** The joined user shape that the session query and {@link toSessionUser} share. */
type UserWithRole = Prisma.UserGetPayload<{
  include: { role: { include: { permissions: { include: { permission: true } } } } };
}>;

/**
 * Resolved once per request. `cache` dedupes the cookie read plus the DB round-trip
 * across every Server Component and Server Action in the same render.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!SIGN_IN_STATUSES.includes(session.user.status)) return null;

  return toSessionUser(session.user, session.id);
});

/**
 * Guards a page, a leaf component or a Server Action.
 * Next 16 places checks here rather than in layouts, because layouts do not re-render
 * on client navigation and cannot stop a sibling segment from rendering.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/admin/login');
  return user;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  const isSuper = user.permissions.includes('*');
  if (!isSuper && !user.permissions.includes(permission)) {
    redirect('/admin/no-access');
  }
  return user;
}

/** Server Actions use this: it returns instead of redirecting, so the caller controls the message. */
export async function assertPermissions(
  permissions: readonly string[],
): Promise<{ ok: true; user: SessionUser } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: translate(await getAdminLocale(), 'error.sessionExpired') };
  const allowed = user.permissions.includes('*') || permissions.some((permission) => user.permissions.includes(permission));
  return allowed ? { ok: true, user } : { ok: false, error: translate(await actorLocale(user.language), 'error.noPermission') };
}

/** Holding any one of `permissions` is enough. */
export function assertPermission(permission: string) {
  return assertPermissions([permission]);
}

export async function startSession(userId: string, twoFactorVerified = false): Promise<string> {
  const ttl = await sessionTtlMinutes();
  const token = generateToken();
  const agent = await headers();

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      ip: agent.get('x-forwarded-for') ?? null,
      userAgent: agent.get('user-agent')?.slice(0, 500) ?? null,
      twoFactorVerified,
      expiresAt: new Date(Date.now() + ttl * 60_000),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: Date.now() + ttl * 60_000,
  });

  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });

  return token;
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function endAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listActiveSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true, twoFactorVerified: true },
  });
}
