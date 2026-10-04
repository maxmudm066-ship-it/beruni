import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * A liveness probe for hosting dashboards. It answers only whether the process can reach the
 * database: how many materials or accounts the institute holds is staff information, and this route
 * is readable by anyone.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, database: 'unreachable' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, database: 'connected' });
}
