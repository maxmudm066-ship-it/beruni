import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { typeLabel } from '@/lib/content/material-read';
import { adminEditPath } from '@/lib/content/routes';
import { PAGE_SIZE, textSearchOr } from '@/lib/admin/list-query';
import { QUEUE_STATUS_VALUES, parseQueueFilters, queueQuery, typeKeysFor, type QueueStatus } from '@/lib/admin/workflow';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { reviewDecision } from './actions';

const QUEUE_TITLE: Record<QueueStatus, TranslationKey> = {
  in_review: 'review.waiting',
  approved: 'review.approvedList',
  scheduled: 'ver.scheduled',
};

const NOTICE: Record<string, TranslationKey> = {
  approved: 'review.approved',
  rejected: 'review.rejected',
  published: 'review.published',
  denied: 'bulk.denied',
  missing: 'review.notWaiting',
  reason: 'review.needReason',
};

/**
 * Review queue. Every button is a plain form post, so a slow editor with JavaScript turned off
 * still works through the queue; the reason field is required because a rejection without notes
 * leaves the author with nothing to fix.
 */
export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const may = (permission: string) => user.permissions.includes('*') || user.permissions.includes(permission);
  const allowedTypes = typeKeysFor(user.permissions, ['review', 'publish']);
  if (!allowedTypes.length) redirect('/admin/no-access');

  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const filters = parseQueueFilters(query);
  const status: QueueStatus = (filters.status || 'in_review') as QueueStatus;
  const typeFilter = allowedTypes.includes(filters.type) ? filters.type : '';
  const activeTypes = typeFilter ? [typeFilter] : allowedTypes;

  const where = {
    deletedAt: null,
    status,
    group: { type: { in: activeTypes }, deletedAt: null },
    ...(filters.q ? { AND: [{ OR: textSearchOr(filters.q) }] } : {}),
  };

  const [items, counts] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      include: {
        author: { select: { displayName: true } },
        updatedBy: { select: { displayName: true } },
        group: { select: { type: true } },
      },
      orderBy: [{ submittedForReviewAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contentItem.groupBy({
      by: ['status'],
      where: { deletedAt: null, status: { in: [...QUEUE_STATUS_VALUES] }, group: { type: { in: allowedTypes }, deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const waiting = counts.reduce((sum, row) => sum + (row.status === status ? row._count._all : 0), 0);
  const pageCount = Math.max(1, Math.ceil(waiting / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const self = `/admin/reviews${queueQuery({ ...filters, type: typeFilter, status }, { page })}`;
  const noticeKey = typeof query.decision === 'string' ? query.decision : '';
  const notice = NOTICE[noticeKey] ? t(NOTICE[noticeKey]) : '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('review.queue')} description={t('review.note')} />

      {notice ? (
        <p
          className={
            noticeKey === 'denied' || noticeKey === 'missing' || noticeKey === 'reason'
              ? 'mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              : 'mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
          }
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <nav aria-label={t('review.queue')} className="mb-4 flex flex-wrap gap-2">
        {QUEUE_STATUS_VALUES.map((key) => {
          const total = counts.find((row) => row.status === key)?._count._all ?? 0;
          const active = key === status;
          return (
            <Link
              key={key}
              href={`/admin/reviews${queueQuery({ ...filters, type: typeFilter, status: key }, { page: 1 })}`}
              className={
                active
                  ? 'rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium'
                  : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
              }
            >
              {t(QUEUE_TITLE[key])} · {total}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/reviews" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="status" value={status} />
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="review-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="review-q" name="q" defaultValue={filters.q} placeholder={t('list.searchPlaceholder')} className="max-w-md" />
        </div>

        <div className="space-y-1">
          <label htmlFor="review-type" className="text-xs text-muted-foreground">
            {t('trash.type')}
          </label>
          <select id="review-type" name="type" defaultValue={typeFilter} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('review.all')}</option>
            {allowedTypes.map((key) => (
              <option key={key} value={key}>
                {typeLabel(locale, key)}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" size="sm" className="h-9">
          <Search />
          {t('list.search')}
        </Button>

        {filters.q || typeFilter ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-muted-foreground">
            <Link href={`/admin/reviews?status=${status}`}>
              <X />
              {t('list.clear')}
            </Link>
          </Button>
        ) : null}
      </form>

      <Card>
        <CardContent className="pt-0">
          {items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('trash.material')}</TableHead>
                  <TableHead className="w-40">{t('trash.type')}</TableHead>
                  <TableHead className="w-16">{t('list.language')}</TableHead>
                  <TableHead className="w-36">{t('common.status')}</TableHead>
                  <TableHead className="w-44">{status === 'scheduled' ? t('list.published') : t('review.submittedAt')}</TableHead>
                  <TableHead className="w-64">{t('list.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const canReview = may(`${item.group.type}.review`) || may(`${item.group.type}.publish`);
                  const canPublish = may(`${item.group.type}.publish`);
                  const hidden = { type: item.group.type, id: item.id, back: self } as const;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-sm">
                        <Link href={adminEditPath(item.group.type, item.id)} className="font-medium hover:underline">
                          {item.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          /{item.slug}
                          <span title={item.id} className="ml-2 font-mono">
                            #{item.id.slice(-6)}
                          </span>
                        </p>
                        {item.rejectReason ? (
                          <p className="mt-1 truncate text-xs text-amber-700 dark:text-amber-400">
                            {t('review.rejectedReason')}: {item.rejectReason}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{typeLabel(locale, item.group.type)}</TableCell>
                      <TableCell className="uppercase">{item.lang}</TableCell>
                      <TableCell>
                        <StatusPill status={item.status} label={statusLabel(locale, item.status)} />
                        <p className="mt-1 text-xs text-muted-foreground">{item.updatedBy?.displayName ?? item.author?.displayName ?? '—'}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(status === 'scheduled' ? (item.scheduledAt ?? item.publishedAt) : item.submittedForReviewAt, locale)}
                      </TableCell>
                      <TableCell>
                        {canReview || canPublish ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {status !== 'approved' && canReview ? (
                              <form action={reviewDecision} className="flex items-center gap-2">
                                <input type="hidden" name="decision" value="approve" />
                                <input type="hidden" name="type" value={hidden.type} />
                                <input type="hidden" name="id" value={hidden.id} />
                                <input type="hidden" name="back" value={hidden.back} />
                                <Button type="submit" size="sm">{t('review.approve')}</Button>
                              </form>
                            ) : null}
                            {status !== 'scheduled' && canPublish ? (
                              <form action={reviewDecision} className="flex items-center gap-2">
                                <input type="hidden" name="decision" value="publish" />
                                <input type="hidden" name="type" value={hidden.type} />
                                <input type="hidden" name="id" value={hidden.id} />
                                <input type="hidden" name="back" value={hidden.back} />
                                <Button type="submit" size="sm" variant="outline">{t('review.publish')}</Button>
                              </form>
                            ) : null}
                            {status !== 'scheduled' && canReview ? (
                              <form action={reviewDecision} className="flex min-w-52 flex-1 items-center gap-2">
                                <input type="hidden" name="decision" value="reject" />
                                <input type="hidden" name="type" value={hidden.type} />
                                <input type="hidden" name="id" value={hidden.id} />
                                <input type="hidden" name="back" value={hidden.back} />
                                <Input
                                  name="reason"
                                  required
                                  maxLength={500}
                                  placeholder={t('review.reason')}
                                  aria-label={t('review.reason')}
                                  className="h-8 min-w-28 flex-1 text-sm"
                                />
                                <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                                  {t('review.reject')}
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('bulk.denied')}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="px-1 py-10 text-center">
              <p className="text-sm text-muted-foreground">{filters.q || typeFilter ? t('list.noResults') : t('review.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label={t('list.pageOf')} className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/reviews${queueQuery({ ...filters, type: typeFilter, status }, { page: page - 1 })}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/reviews${queueQuery({ ...filters, type: typeFilter, status }, { page: page + 1 })}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
