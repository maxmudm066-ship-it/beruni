import 'server-only';
import { generateSecret, generateURI, verify } from 'otplib';

const ISSUER = 'Beruniy CMS';

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(account: string, secret: string): string {
  return generateURI({ label: account, secret, issuer: ISSUER });
}

/**
 * ±30 seconds of drift is allowed: a staff member reading a code off their phone and typing
 * it in will routinely cross a 30-second boundary, and otplib is strict (tolerance 0) by
 * default. Codes still expire — this only forgives clock skew and slow entry.
 */
export async function verifyTotp(token: string, secret: string): Promise<boolean> {
  const result = await verify({ token: token.trim(), secret, epochTolerance: 30 });
  return result.valid;
}
