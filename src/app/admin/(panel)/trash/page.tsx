import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, Undo2, X } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { CONTENT_TYPES } from '@/lib/content-types';
import { typeLabel } from '@/lib/content/material-read';
import { PAGE_SIZE, textSearchOr } from '@/lib/admin/list-query';
import { parseQueueFilters, queueQuery, typeKeysFor } from '@/lib/admin/workflow';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteMaterialPermanently, restoreMaterial } from './actions';

/**
 * Trash. Nothing here destroys data by accident: rows only carry deletedAt, restoring is one click,
 * and permanent deletion needs a second click on a screen that repeats what is about to be lost.
 */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const may = (permission: string) => user.permissions.includes('*') || user.permissions.includes(permission);
  const allowedTypes = may('trash.manage') ? CONTENT_TYPES.map((type) => type.key) : typeKeysFor(user.permissions, ['delete', 'edit']);
  if (!allowedTypes.length) redirect('/admin/no-access');

  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const filters = parseQueueFilters(query);
  const typeFilter = allowedTypes.includes(filters.type) ? filters.type : '';
  const activeTypes = typeFilter ? [typeFilter] : allowedTypes;

  const where = {
    deletedAt: { not: null },
    group: { type: { in: activeTypes } },
    ...(filters.q ? { AND: [{ OR: textSearchOr(filters.q) }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      include: {
        updatedBy: { select: { displayName: true } },
        group: { select: { type: true, items: { select: { id: true } } } },
      },
      orderBy: { deletedAt: 'desc' },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contentItem.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const self = `/admin/trash${queueQuery({ ...filters, type: typeFilter }, { page })}`;
  const confirmHref = (id: string) => `${self}${self.includes('?') ? '&' : '?'}delete=${id}`;
  const confirmId = typeof query.delete === 'string' ? query.delete : '';
  // Permanent deletion is a Super-Admin privilege; an editor gets no button that would only refuse them.
  const mayPurge = may('trash.manage');

  const restored = typeof query.restored === 'string' ? query.restored : '';
  const deleted = typeof query.deleted === 'string' ? query.deleted : '';
  const notice =
    restored === 'denied' || deleted === 'denied'
      ? t('bulk.denied')
      : restored === 'missing' || deleted === 'missing'
        ? t('trash.notFound')
        : restored
          ? t('trash.restored')
          : deleted
            ? t('trash.deleted')
            : '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('trash.title')} description={t('trash.note')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <form method="get" action="/admin/trash" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="trash-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="trash-q" name="q" defaultValue={filters.q} placeholder={t('list.searchPlaceholder')} className="max-w-md" />
        </div>

        <div className="space-y-1">
          <label htmlFor="trash-type" className="text-xs text-muted-foreground">
            {t('trash.type')}
          </label>
          <select id="trash-type" name="type" defaultValue={typeFilter} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('common.all')}</option>
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
            <Link href="/admin/trash">
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
                  <TableHead className="w-36">{t('form.status')}</TableHead>
                  <TableHead className="w-44">{t('trash.removedAt')}</TableHead>
                  <TableHead className="w-40">{t('trash.removedBy')}</TableHead>
                  <TableHead className="w-56">{t('list.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-sm">
                      <span className="font-medium">{item.title}</span>
                      <p className="truncate text-xs text-muted-foreground">
                        /{item.slug}
                        <span title={item.id} className="ml-2 font-mono">
                          #{item.id.slice(-6)}
                        </span>
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{typeLabel(locale, item.group.type)}</TableCell>
                    <TableCell className="uppercase">{item.lang}</TableCell>
                    <TableCell>
                      <StatusPill status={item.status} label={statusLabel(locale, item.status)} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(item.deletedAt, locale)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.updatedBy?.displayName ?? '—'}
                      <span className="ml-2 text-xs">· {t('trash.versions')}: {item.group.items.length}</span>
                    </TableCell>
                    <TableCell>
                      {confirmId === item.id ? (
                        <div className="space-y-2">
                          <p className="text-xs text-destructive">{t('trash.deleteHint')}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <form action={deleteMaterialPermanently}>
                              <input type="hidden" name="type" value={item.group.type} />
                              <input type="hidden" name="id" value={item.id} />
                              <input type="hidden" name="back" value={self} />
                              <Button type="submit" size="sm" variant="destructive">
                                {t('trash.delete')}
                              </Button>
                            </form>
                            <Button asChild size="sm" variant="ghost">
                              <Link href={self}>{t('common.cancel')}</Link>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={restoreMaterial}>
                            <input type="hidden" name="type" value={item.group.type} />
                            <input type="hidden" name="id" value={item.id} />
                            <input type="hidden" name="back" value={self} />
                            <Button type="submit" size="sm" variant="outline">
                              <Undo2 />
                              {t('trash.restore')}
                            </Button>
                          </form>
                          {mayPurge ? (
                            <Button asChild size="sm" variant="ghost" className="text-destructive">
                              <Link href={confirmHref(item.id)}>
                                {t('trash.delete')}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-1 py-10 text-center">
              <p className="text-sm text-muted-foreground">{filters.q || typeFilter ? t('list.noResults') : t('trash.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label={t('list.pageOf')} className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/trash${queueQuery({ ...filters, type: typeFilter }, { page: page - 1 })}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount} · {t('list.results')}: {total}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/trash${queueQuery({ ...filters, type: typeFilter }, { page: page + 1 })}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
