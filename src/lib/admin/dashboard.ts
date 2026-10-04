import 'server-only';
import { prisma } from '@/lib/db';
import { publishScheduledItems } from '@/lib/content/schedule';

export interface DashboardMetrics {
  counts: {
    inReview: number;
    drafts: number;
    scheduled: number;
    published: number;
    archived: number;
    missingTranslations: number;
    expiredAnnouncements: number;
    failedUploads: number;
    brokenLinks: number;
    newMessages: number;
  };
  languages: { code: string; name: string }[];
  upcoming: { id: string; title: string; scheduledAt: Date | null; lang: string }[];
  reviewQueue: { id: string; title: string; lang: string; type: string; submittedForReviewAt: Date | null }[];
  translationGaps: { groupId: string; title: string; type: string; missing: string[] }[];
  activity: { id: string; description: string; action: string; at: Date; user: string }[];
  scheduledRuns: {
    id: string;
    itemId: string;
    title: string;
    type: string;
    lang: string;
    failed: boolean;
    message: string | null;
    ranAt: Date;
  }[];
  linksCheckedAt: Date | null;
}

/**
 * Everything the dashboard shows is computed from real rows. The queries are deliberately
 * coarse (a few grouped counts) because the admin opens this page many times a day.
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  // Hosting cron calls /api/cron/publish, but a scheduler is not guaranteed in every deployment,
  // so opening the dashboard also releases whatever has reached its time. A broken sweep must
  // never take the page down.
  await publishScheduledItems().catch((error: unknown) => console.error('scheduled publish failed', error));

  const languages = await prisma.language.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, name: true },
  });
  const langCodes = languages.map((l) => l.code);

  const statusCounts = prisma.contentItem.groupBy({
    by: ['status'],
    where: { deletedAt: null },
    _count: { _all: true },
  });

  const expiredQuery = prisma.announcement.count({
    where: {
      expiresAt: { lt: new Date() },
      group: { items: { some: { status: 'published', deletedAt: null } } },
    },
  });

  const failedQuery = prisma.media.count({ where: { status: 'failed' } });
  const messagesQuery = prisma.contactMessage.count({ where: { stage: 'new' } });

  const [statuses, expired, failed, messages, reviewQueue, upcoming, lastRun, activity, runLog] = await Promise.all([
    statusCounts,
    expiredQuery,
    failedQuery,
    messagesQuery,
    prisma.contentItem.findMany({
      where: { status: 'in_review', deletedAt: null },
      orderBy: { submittedForReviewAt: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        lang: true,
        submittedForReviewAt: true,
        group: { select: { type: true } },
      },
    }),
    prisma.contentItem.findMany({
      where: { status: 'scheduled', deletedAt: null },
      orderBy: { scheduledAt: 'asc' },
      take: 6,
      select: { id: true, title: true, lang: true, scheduledAt: true },
    }),
    prisma.linkCheckRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { id: true, startedAt: true } }),
    prisma.auditLog.findMany({
      where: { action: { not: 'login' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, action: true, description: true, createdAt: true, user: { select: { displayName: true } } },
    }),
    prisma.scheduledPublishLog.findMany({
      orderBy: { ranAt: 'desc' },
      take: 8,
      select: { id: true, itemId: true, status: true, message: true, ranAt: true },
    }),
  ]);

  // A run line means nothing unless the person can open the material it is about, so lines about
  // material that has since been removed are dropped.
  const runItemIds = [...new Set(runLog.map((row) => row.itemId))];
  const runItems = runItemIds.length
    ? await prisma.contentItem.findMany({
        where: { id: { in: runItemIds } },
        select: { id: true, title: true, lang: true, group: { select: { type: true } } },
      })
    : [];
  const runTargets = new Map(runItems.map((row) => [row.id, row]));

  const brokenLinks = lastRun
    ? await prisma.linkCheck.count({ where: { runId: lastRun.id, status: 'broken' } })
    : 0;

  const count = (status: string) => statuses.find((s) => s.status === status)?._count._all ?? 0;

  // A material is "missing a translation" when it is published in at least one language
  // but has no version at all in another active language.
  const publishedGroupIds = await prisma.contentItem.findMany({
    where: { status: 'published', deletedAt: null },
    distinct: ['groupId'],
    select: { groupId: true },
  });
  const ids = publishedGroupIds.map((row) => row.groupId);

  let missingTranslations = 0;
  const translationGaps: DashboardMetrics['translationGaps'] = [];

  if (ids.length > 0) {
    const [existing, titles] = await Promise.all([
      prisma.contentItem.findMany({
        where: { groupId: { in: ids }, deletedAt: null },
        distinct: ['groupId', 'lang'],
        select: { groupId: true, lang: true },
      }),
      prisma.contentItem.findMany({
        where: { groupId: { in: ids } },
        distinct: ['groupId'],
        select: { groupId: true, title: true, lang: true, group: { select: { type: true } } },
      }),
    ]);

    const covered = new Set(existing.map((row) => `${row.groupId}:${row.lang}`));

    for (const row of titles) {
      const missing = langCodes.filter((code) => !covered.has(`${row.groupId}:${code}`));
      if (missing.length === 0) continue;
      missingTranslations += missing.length;
      if (translationGaps.length < 8) {
        translationGaps.push({ groupId: row.groupId, title: row.title, type: row.group.type, missing });
      }
    }
  }

  return {
    counts: {
      inReview: count('in_review'),
      drafts: count('draft'),
      scheduled: count('scheduled'),
      published: count('published'),
      archived: count('archived'),
      missingTranslations,
      expiredAnnouncements: expired,
      failedUploads: failed,
      brokenLinks,
      newMessages: messages,
    },
    languages,
    upcoming: upcoming.map((row) => ({ id: row.id, title: row.title, lang: row.lang, scheduledAt: row.scheduledAt })),
    reviewQueue: reviewQueue.map((row) => ({
      id: row.id,
      title: row.title,
      lang: row.lang,
      type: row.group.type,
      submittedForReviewAt: row.submittedForReviewAt,
    })),
    translationGaps,
    scheduledRuns: runLog.flatMap((row) => {
      const item = runTargets.get(row.itemId);
      if (!item) return [];
      return [
        {
          id: row.id,
          itemId: row.itemId,
          title: item.title,
          type: item.group.type,
          lang: item.lang,
          failed: row.status === 'failed',
          message: row.message,
          ranAt: row.ranAt,
        },
      ];
    }),
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      description: row.description,
      at: row.createdAt,
      user: row.user?.displayName ?? '—',
    })),
    linksCheckedAt: lastRun?.startedAt ?? null,
  };
}
