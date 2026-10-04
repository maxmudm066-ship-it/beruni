import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Opaque session token: 32 random bytes, returned to the browser, stored only as a hash. */
export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Timing-safe comparison of two equal-length secrets. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface PasswordCheckResult {
  ok: boolean;
  problems: string[];
}

/** Minimal policy for institute staff accounts. */
export function checkPasswordStrength(plain: string): PasswordCheckResult {
  const problems: string[] = [];
  if (plain.length < 10) problems.push('Use at least 10 characters.');
  if (!/[a-z]/.test(plain)) problems.push('Add a lowercase letter.');
  if (!/[A-Z]/.test(plain)) problems.push('Add an uppercase letter.');
  if (!/[0-9]/.test(plain)) problems.push('Add a digit.');
  return { ok: problems.length === 0, problems };
}
