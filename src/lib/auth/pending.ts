import 'server-only';
import crypto from 'node:crypto';

export const PENDING_COOKIE = 'beruni_admin_2fa_pending';
export const PENDING_MAX_AGE_SECONDS = 5 * 60;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('SESSION_SECRET is missing or too short. Set it in .env before signing in.');
  }
  return value;
}

/** Short-lived, HMAC-signed ticket proving the password was correct but 2FA is still owed. */
export function signPendingTicket(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + PENDING_MAX_AGE_SECONDS * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readPendingTicket(ticket: string | undefined): string | null {
  if (!ticket) return null;
  const [payload, signature] = ticket.split('.');
  if (!payload || !signature) return null;

  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { u: string; e: number };
    if (!parsed.u || typeof parsed.e !== 'number') return null;
    if (parsed.e < Date.now()) return null;
    return parsed.u;
  } catch {
    return null;
  }
}
