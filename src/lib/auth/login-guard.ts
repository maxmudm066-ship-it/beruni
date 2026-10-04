import 'server-only';
import { prisma } from '@/lib/db';
import type { TranslationKey } from '@/lib/admin/labels';

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS_PER_IP = 20;

async function numberSetting(key: string, fallback: number): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { group_key: { group: 'security', key } },
  });
  const parsed = Number.parseInt(setting?.value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface LoginGate {
  allowed: boolean;
  /** Dictionary key, not text: the sign-in screen shows it in the language of whoever is trying to enter. */
  reason?: TranslationKey;
  retryAfterSeconds?: number;
}

/**
 * Two layers: a per-account lockout after repeated wrong passwords, and a coarse
 * per-IP limit. Both are stored in the database so they survive a server restart.
 */
export async function checkLoginAllowed(email: string, ip: string): Promise<LoginGate> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    return {
      allowed: false,
      reason: 'error.accountLocked',
      retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const ipAttempts = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gte: since } },
  });
  if (ipAttempts >= MAX_ATTEMPTS_PER_IP) {
    return {
      allowed: false,
      reason: 'error.tooManyAttempts',
      retryAfterSeconds: WINDOW_MINUTES * 60,
    };
  }

  return { allowed: true };
}

export async function recordFailedLogin(email: string, ip: string, userId: string | null): Promise<void> {
  const maxFailed = await numberSetting('max_failed_logins', 5);
  const lockMinutes = await numberSetting('lock_minutes', 15);

  await prisma.loginAttempt.create({ data: { email: email.toLowerCase(), ip, success: false, userId } });

  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const failedCount = user.failedLoginCount + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: failedCount,
      lockedUntil: failedCount >= maxFailed ? new Date(Date.now() + lockMinutes * 60_000) : user.lockedUntil,
    },
  });
}

export async function recordSuccessfulLogin(email: string, ip: string, userId: string): Promise<void> {
  await prisma.loginAttempt.create({ data: { email: email.toLowerCase(), ip, success: true, userId } });
  // Five typos spread over a working year must not lock a person out: a correct password restarts the count.
  await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
}
