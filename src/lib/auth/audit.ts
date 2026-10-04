import 'server-only';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';

export interface AuditInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  payload?: unknown;
}

/**
 * Writes an audit entry. A failed audit write must not undo the user's action, so errors
 * are reported and swallowed rather than thrown.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const agent = await headers();
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        payload: input.payload === undefined ? null : JSON.stringify(input.payload),
        ip: agent.get('x-forwarded-for') ?? null,
      },
    });
  } catch (error) {
    console.error('audit write failed', error);
  }
}

/** Field-level diff used by Version History ("changes" column). */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  skip: string[] = ['updatedAt', 'revision'],
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(before)) {
    if (skip.includes(key)) continue;
    const a = before[key];
    const b = after[key];
    if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) changed.push(key);
  }
  return changed;
}
