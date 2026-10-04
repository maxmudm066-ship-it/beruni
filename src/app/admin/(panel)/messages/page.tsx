import Link from 'next/link';
import { Search, X } from 'lucide-react';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { caseVariants, PAGE_SIZE } from '@/lib/admin/list-query';
import {
  isMessageStage,
  MESSAGE_STAGES,
  MESSAGE_STAGE_ACTIONS,
  MESSAGE_STAGE_LABELS,
  MESSAGE_STAGE_STATUSES,
  messagesQuery,
  type MessageStage,
} from '@/lib/admin/messages';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { setMessageStage } from './actions';
import { MESSAGE_NOTICES } from './notices';

/** The button above each message offers the step a person would take next, not four choices. */
const NEXT_STAGE: Record<MessageStage, MessageStage> = {
  new: 'read',
  read: 'replied',
  replied: 'archived',
  archived: 'new',
};

/**
 * Contact messages: what visitors wrote through the form on the site. Marking a message only records
 * that it was dealt with — the answer itself goes out over the visitor's own e-mail address.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('contact_messages.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);

  const query = await searchParams;
  const rawStage = typeof query.stage === 'string' ? query.stage : '';
  const stage: MessageStage = isMessageStage(rawStage) ? rawStage : 'new';
  const q = (typeof query.q === 'string' ? query.q : '').trim().slice(0, 120);
  const parsedPage = Number.parseInt(typeof query.page === 'string' ? query.page : '', 10);
  const wantedPage = Number.isFinite(parsedPage) && parsedPage > 1 ? parsedPage : 1;

  const search: Prisma.ContactMessageWhereInput = q
    ? { OR: caseVariants(q).flatMap((value) => [{ name: { contains: value } }, { email: { contains: value } }, { subject: { contains: value } }, { message: { contains: value } }]) }
    : {};

  const [rows, total, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where: { stage, ...search },
      orderBy: { createdAt: 'desc' },
      skip: (wantedPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contactMessage.count({ where: { stage, ...search } }),
    prisma.contactMessage.groupBy({ by: ['stage'], _count: { _all: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(wantedPage, pageCount);
  const noticeKey = typeof query.notice === 'string' ? query.notice : '';
  const notice = MESSAGE_NOTICES[noticeKey] ? t(MESSAGE_NOTICES[noticeKey]) : '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('messages.title')} description={t('messages.subtitle')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <nav aria-label={t('messages.title')} className="mb-4 flex flex-wrap gap-2">
        {MESSAGE_STAGES.map((key) => {
          const count = counts.find((row) => row.stage === key)?._count._all ?? 0;
          const active = key === stage;
          return (
            <Link
              key={key}
              href={`/admin/messages${messagesQuery(key, q, 1)}`}
              className={
                active
                  ? 'rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium'
                  : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent'
              }
            >
              {t(MESSAGE_STAGE_LABELS[key])} · {count}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/admin/messages" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="stage" value={stage} />
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="messages-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="messages-q" name="q" defaultValue={q} placeholder={t('auditLog.searchPlaceholder')} className="max-w-md" />
        </div>
        <Button type="submit" size="sm" className="h-9">
          <Search />
          {t('list.search')}
        </Button>
        {q ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-muted-foreground">
            <Link href={`/admin/messages${messagesQuery(stage, '', 1)}`}>
              <X />
              {t('list.clear')}
            </Link>
          </Button>
        ) : null}
      </form>

      <Card>
        <CardContent className="pt-0">
          {rows.length === 0 ? (
            <div className="px-1 py-10 text-center">
              <p className="text-sm text-muted-foreground">{q ? t('list.noResults') : t('messages.empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">{t('messages.from')}</TableHead>
                  <TableHead>{t('messages.subject')}</TableHead>
                  <TableHead className="w-40">{t('messages.received')}</TableHead>
                  <TableHead className="w-32">{t('common.status')}</TableHead>
                  <TableHead className="w-56">{t('list.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const current = row.stage as MessageStage;
                  const next = NEXT_STAGE[current];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-56">
                        <p className="truncate font-medium">{row.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <Link href={`/admin/messages/${row.id}`} className="font-medium underline-offset-4 hover:underline">
                          {row.subject || t('messages.noSubject')}
                        </Link>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.message}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDateTime(row.createdAt, locale)}</TableCell>
                      <TableCell>
                        <StatusPill status={row.stage} label={t(MESSAGE_STAGE_STATUSES[current])} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/messages/${row.id}`}>{t('common.open')}</Link>
                          </Button>
                          <form action={setMessageStage}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="stage" value={next} />
                            <input type="hidden" name="back" value={`/admin/messages${messagesQuery(stage, q, page)}`} />
                            <Button type="submit" size="sm" variant="ghost">
                              {t(MESSAGE_STAGE_ACTIONS[next])}
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label={t('list.pageOf')} className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/messages${messagesQuery(stage, q, page - 1)}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/messages${messagesQuery(stage, q, page + 1)}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
