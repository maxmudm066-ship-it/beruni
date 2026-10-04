import 'server-only';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS } from '@/lib/enums';

export const CRON_BATCH = 200;

export interface ScheduleResult {
  published: string[];
  failed: { id: string; reason: string }[];
}

/** Written into ContentRevision.changeSummary by the scheduler; the versions list translates it. */
export const SCHEDULED_REVISION_SUMMARY = 'cron:publish';

/**
 * Prisma wraps a failing query in the generated call site: a `.next` chunk path plus numbered source
 * lines. Only the last sentence carries information, and the Dashboard shows this text verbatim.
 */
function reasonText(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'unknown error';
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('Invalid `') && !/^\d/.test(line) && !line.startsWith('→') && !line.includes('.next'));
  return (lines.at(-1) ?? raw).slice(0, 200);
}

/**
 * Moves materials whose scheduled moment has arrived to Published.
 *
 * Every run is recorded in ScheduledPublishLog, including failures, so the Dashboard can show why
 * something did not go live instead of leaving the administrator to guess.
 */
export async function publishScheduledItems(now: Date = new Date()): Promise<ScheduleResult> {
  const due = await prisma.contentItem.findMany({
    where: { status: CONTENT_STATUS.SCHEDULED, scheduledAt: { not: null, lte: now } },
    select: { id: true, title: true, lang: true, status: true, revision: true, publishedAt: true, scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
    take: CRON_BATCH,
  });

  const result: ScheduleResult = { published: [], failed: [] };

  for (const item of due) {
    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.contentItem.update({
          where: { id: item.id },
          data: {
            status: CONTENT_STATUS.PUBLISHED,
            publishedAt: item.publishedAt ?? item.scheduledAt ?? now,
            scheduledAt: null,
            revision: { increment: 1 },
          },
          select: { id: true, lang: true, title: true, subtitle: true, slug: true, excerpt: true, body: true, status: true, revision: true },
        });

        await tx.contentRevision.create({
          data: {
            itemId: updated.id,
            version: updated.revision,
            title: updated.title,
            subtitle: updated.subtitle,
            slug: updated.slug,
            excerpt: updated.excerpt,
            body: updated.body,
            status: updated.status,
            changeSummary: SCHEDULED_REVISION_SUMMARY,
          },
        });

        await tx.scheduledPublishLog.create({
          data: { itemId: updated.id, status: CONTENT_STATUS.PUBLISHED, message: `«${updated.title}» (${updated.lang})` },
        });
      });
      result.published.push(item.id);
    } catch (error) {
      const reason = reasonText(error);
      result.failed.push({ id: item.id, reason });
      await prisma.scheduledPublishLog.create({
        data: { itemId: item.id, status: 'failed', message: reason },
      });
    }
  }

  if (result.published.length) revalidatePath('/', 'layout');
  return result;
}
