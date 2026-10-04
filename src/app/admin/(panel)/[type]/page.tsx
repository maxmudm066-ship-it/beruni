import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDate } from '@/lib/admin/format';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { categoryOptions } from '@/lib/content/material-read';
import { adminEditPath, adminListPath, adminNewPath } from '@/lib/content/routes';
import {
  BULK_ACTIONS,
  BULK_PERMISSION,
  PAGE_SIZE,
  SORT_KEYS,
  buildListWhere,
  categoriesForGroups,
  hasCategoryField,
  isBulkAction,
  languagesInUse,
  listQuery,
  orderByFor,
  parseFilters,
  type SortKey,
} from '@/lib/admin/list-query';
import { bulkBarLabels } from '@/lib/admin/labels';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { BulkBar, BulkSelectAll } from '@/components/admin/list/bulk-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CONTENT_STATUS_VALUES } from '@/lib/enums';
import { bulkMaterialAction } from './actions';

const SORT_LABEL: Record<SortKey, TranslationKey> = {
  updated: 'list.sortUpdated',
  created: 'list.sortCreated',
  title: 'list.sortTitle',
  published: 'list.sortPublished',
  status: 'list.sortStatus',
};

/**
 * Listing of one content type: free-text search across title, text, slug, tags, author and
 * category, the usual filters, and bulk actions that work without JavaScript.
 */
export default async function MaterialListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type } = await params;
  const def = CONTENT_TYPE_MAP.get(type);
  if (!def) notFound();

  const user = await requirePermission(`${def.key}.view`);
  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const typeTitle = t(`type.${def.key}` as TranslationKey);
  const filters = parseFilters(query);
  const withCategory = hasCategoryField(def);

  const where = await buildListWhere(def, filters);
  const [items, total, languages, categories] = await Promise.all([
    prisma.contentItem.findMany({
      where,
      include: {
        author: { select: { displayName: true } },
        group: { select: { authorships: { orderBy: { sortOrder: 'asc' }, take: 1, select: { fullName: true } } } },
      },
      orderBy: orderByFor(filters.sort),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contentItem.count({ where }),
    languagesInUse(def),
    categoryOptions(def.categoryScope, locale),
  ]);

  const categoryNames = withCategory ? await categoriesForGroups(def, items.map((item) => item.groupId), locale) : new Map<string, string>();
  const may = (permission: string) => user.permissions.includes('*') || user.permissions.includes(permission);
  const bulkActions = BULK_ACTIONS.filter((action) => may(`${def.key}.${BULK_PERMISSION[action]}`)).filter(
    (action) => action !== 'moveCategory' || withCategory,
  );

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const base = adminListPath(def.key);
  const hasFilters = Boolean(filters.q || filters.status || filters.lang || filters.categoryId);
  const rawBulk = typeof query.bulk === 'string' ? query.bulk : '';
  const notice = rawBulk === 'denied' || rawBulk === 'none' || isBulkAction(rawBulk) ? rawBulk : '';
  const processed = Number.parseInt(typeof query.n === 'string' ? query.n : '', 10);

  const trashed = typeof query.trashed === 'string' ? query.trashed : '';
  const trashNotice = trashed === 'denied' ? t('bulk.denied') : trashed === 'missing' ? t('trash.notFound') : trashed ? t('trash.moved') : '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={typeTitle}
        description={`${t('list.results')}: ${total}`}
        actions={
          <Button size="sm" asChild>
            <Link href={adminNewPath(def.key)}>
              <Plus />
              {t('list.create')}
            </Link>
          </Button>
        }
      />

      {notice ? (
        <p
          className={
            notice === 'denied' || notice === 'none'
              ? 'mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              : 'mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
          }
          role="status"
        >
          {notice === 'denied'
            ? t('bulk.denied')
            : notice === 'none'
              ? t('bulk.nothing')
              : `${t('bulk.applied')}: ${t(`bulk.${notice}` as TranslationKey)}${Number.isFinite(processed) ? ` · ${processed} ${t('bulk.done')}` : ''}`}
        </p>
      ) : null}

      {trashNotice ? (
        <p
          className={
            trashed === 'denied' || trashed === 'missing'
              ? 'mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              : 'mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
          }
          role="status"
        >
          {trashNotice}{' '}
          <Link href="/admin/trash" className="underline">
            {t('trash.title')}
          </Link>
        </p>
      ) : null}

      <form method="get" action={base} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="list-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="list-q" name="q" defaultValue={filters.q} placeholder={t('list.searchPlaceholder')} className="max-w-md" />
        </div>

        <div className="space-y-1">
          <label htmlFor="list-status" className="text-xs text-muted-foreground">
            {t('list.filterStatus')}
          </label>
          <select id="list-status" name="status" defaultValue={filters.status} className="h-9 min-w-36 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('list.allStatuses')}</option>
            {CONTENT_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(locale, status)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="list-lang" className="text-xs text-muted-foreground">
            {t('list.language')}
          </label>
          <select id="list-lang" name="lang" defaultValue={filters.lang} className="h-9 min-w-28 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('list.allLanguages')}</option>
            {languages.map((lang) => (
              <option key={lang} value={lang} className="uppercase">
                {lang}
              </option>
            ))}
          </select>
        </div>

        {withCategory ? (
          <div className="space-y-1">
            <label htmlFor="list-category" className="text-xs text-muted-foreground">
              {t('list.category')}
            </label>
            <select id="list-category" name="categoryId" defaultValue={filters.categoryId} className="h-9 min-w-40 rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="">{t('list.allCategories')}</option>
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="list-sort" className="text-xs text-muted-foreground">
            {t('list.sort')}
          </label>
          <select id="list-sort" name="sort" defaultValue={filters.sort} className="h-9 min-w-40 rounded-md border border-input bg-transparent px-2 text-sm">
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(SORT_LABEL[key])}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" size="sm" className="h-9">
          <Search />
          {t('list.search')}
        </Button>

        {hasFilters ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-muted-foreground">
            <Link href={base}>
              <X />
              {t('list.clear')}
            </Link>
          </Button>
        ) : null}
      </form>

      <Card>
        <CardContent className="pt-0">
          {items.length ? (
            <form action={bulkMaterialAction}>
              <input type="hidden" name="type" value={def.key} />
              <input type="hidden" name="back" value={`${base}${listQuery(filters, { page })}`} />

              <Table>
                <TableHeader>
                  <TableRow>
                    {bulkActions.length ? (
                      <TableHead className="w-8">
                        <BulkSelectAll label={t('bulk.selectAll')} />
                      </TableHead>
                    ) : null}
                    <TableHead>{t('list.title')}</TableHead>
                    {withCategory ? <TableHead className="w-44">{t('list.category')}</TableHead> : null}
                    <TableHead className="w-40">{t('list.author')}</TableHead>
                    <TableHead className="w-16">{t('list.language')}</TableHead>
                    <TableHead className="w-36">{t('form.status')}</TableHead>
                    <TableHead className="w-32">{filters.sort === 'published' ? t('list.published') : t('list.date')}</TableHead>
                    <TableHead className="w-20">{t('list.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      {bulkActions.length ? (
                        <TableCell>
                          <input
                            type="checkbox"
                            name="ids"
                            data-bulk-id=""
                            value={item.id}
                            aria-label={item.title}
                            className="size-4 accent-[var(--primary)]"
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="max-w-md">
                        <Link href={adminEditPath(def.key, item.id)} className="font-medium hover:underline">
                          {item.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          /{item.slug}
                          <span title={item.id} className="ml-2 font-mono">
                            #{item.id.slice(-6)}
                          </span>
                        </p>
                      </TableCell>
                      {withCategory ? (
                        <TableCell className="text-sm text-muted-foreground">{categoryNames.get(item.groupId) ?? '—'}</TableCell>
                      ) : null}
                      <TableCell className="text-sm text-muted-foreground">
                        {item.author?.displayName ?? item.group.authorships[0]?.fullName ?? '—'}
                      </TableCell>
                      <TableCell className="uppercase">{item.lang}</TableCell>
                      <TableCell>
                        <StatusPill status={item.status} label={statusLabel(locale, item.status)} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.publishedAt ?? item.updatedAt, locale)}
                      </TableCell>
                      <TableCell>
                        <Link href={adminEditPath(def.key, item.id)} className="text-sm underline">
                          {t('list.edit')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {bulkActions.length ? <BulkBar labels={bulkBarLabels(locale)} actions={bulkActions.map((action) => ({ value: action, label: t(`bulk.${action}` as TranslationKey) }))} categories={categories} /> : null}
            </form>
          ) : (
            <div className="space-y-1 px-1 py-10 text-center">
              <p className="text-sm text-muted-foreground">{hasFilters ? t('list.noResults') : t('list.empty')}</p>
              {!hasFilters ? (
                <Link href={adminNewPath(def.key)} className="text-sm underline">
                  {t('list.create')}
                </Link>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label={t('list.pageOf')} className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}${listQuery(filters, { page: page - 1 })}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`${base}${listQuery(filters, { page: page + 1 })}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
