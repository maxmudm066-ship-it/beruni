import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDate } from '@/lib/admin/format';
import { typeLabel } from '@/lib/content/material-read';
import { adminEditPath } from '@/lib/content/routes';
import { PAGE_SIZE, textSearchOr } from '@/lib/admin/list-query';
import { parseTranslationsFilters, translationsQuery, typeKeysFor } from '@/lib/admin/workflow';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addTranslationVersion } from './actions';

const NOTICE: Record<string, TranslationKey> = {
  denied: 'bulk.denied',
  exists: 'trans.existsAlready',
  missing: 'trans.notFound',
};

/**
 * Translations: which published material has no version yet in one of the site languages.
 *
 * A row lists every language version that exists and offers a button for each one that is missing.
 * Pressing it copies the text of the original language into a new draft — the machine never
 * translates, an editor does, and the copied wording is what they start from.
 */
export default async function TranslationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const may = (permission: string) => user.permissions.includes('*') || user.permissions.includes(permission);
  const allowedTypes = typeKeysFor(user.permissions, ['view', 'create', 'edit']);
  if (!allowedTypes.length) redirect('/admin/no-access');

  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);

  const languages = await prisma.language.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, name: true, nativeName: true },
  });
  const filters = parseTranslationsFilters(query, languages.map((language) => language.code), allowedTypes);

  const liveVersions = {
    deletedAt: null,
    ...(filters.q ? { AND: [{ OR: textSearchOr(filters.q) }] } : {}),
  } satisfies Prisma.ContentItemWhereInput;

  const where: Prisma.ContentGroupWhereInput = {
    deletedAt: null,
    type: { in: filters.type ? [filters.type] : allowedTypes },
    ...(filters.group ? { id: filters.group } : {}),
    items: {
      some: { ...liveVersions, status: 'published' },
      ...(filters.lang ? { none: { lang: filters.lang, deletedAt: null } } : {}),
    },
  };

  const [groups, total, coverage] = await Promise.all([
    prisma.contentGroup.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        sourceLang: true,
        updatedAt: true,
        items: {
          where: { deletedAt: null },
          orderBy: { lang: 'asc' },
          select: { id: true, lang: true, title: true, slug: true, status: true },
        },
      },
    }),
    prisma.contentGroup.count({ where }),
    prisma.contentItem.groupBy({
      by: ['groupId', 'lang'],
      where: { deletedAt: null, group: where },
      _count: { _all: true },
    }),
  ]);

  const coveredByGroup = new Map<string, Set<string>>();
  for (const row of coverage) {
    const set = coveredByGroup.get(row.groupId) ?? new Set<string>();
    set.add(row.lang);
    coveredByGroup.set(row.groupId, set);
  }
  let gaps = 0;
  for (const covered of coveredByGroup.values()) {
    gaps += languages.filter((language) => !covered.has(language.code)).length;
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const self = `/admin/translations${translationsQuery(filters, { page })}`;
  const hasFilters = Boolean(filters.q || filters.type || filters.lang || filters.group);
  const noticeKey = typeof query.added === 'string' ? query.added : '';
  const notice = NOTICE[noticeKey] ? t(NOTICE[noticeKey]) : '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('trans.title')} description={t('trans.note')} />

      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {notice}
        </p>
      ) : null}

      <p className="mb-4 text-sm text-muted-foreground">
        {t('trans.materials')}: <span className="font-medium text-foreground tabular-nums">{total}</span> ·{' '}
        {t('trans.gaps')}: <span className="font-medium text-foreground tabular-nums">{gaps}</span>
      </p>

      <form method="get" action="/admin/translations" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="trans-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="trans-q" name="q" defaultValue={filters.q} placeholder={t('list.searchPlaceholder')} className="max-w-md" />
        </div>

        <div className="space-y-1">
          <label htmlFor="trans-type" className="text-xs text-muted-foreground">
            {t('trash.type')}
          </label>
          <select id="trans-type" name="type" defaultValue={filters.type} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('list.allTypes')}</option>
            {allowedTypes.map((key) => (
              <option key={key} value={key}>
                {typeLabel(locale, key)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="trans-lang" className="text-xs text-muted-foreground">
            {t('trans.filterMissing')}
          </label>
          <select id="trans-lang" name="lang" defaultValue={filters.lang} className="h-9 min-w-40 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('list.allLanguages')}</option>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.nativeName || language.name}
              </option>
            ))}
          </select>
        </div>

        {filters.group ? <input type="hidden" name="group" value={filters.group} /> : null}

        <Button type="submit" size="sm" className="h-9">
          <Search />
          {t('list.search')}
        </Button>

        {hasFilters ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-muted-foreground">
            <Link href="/admin/translations">
              <X />
              {t('list.clear')}
            </Link>
          </Button>
        ) : null}
      </form>

      {filters.group ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {t('trans.oneMaterial')} ·{' '}
          <Link href="/admin/translations" className="underline">
            {t('list.clear')}
          </Link>
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-0">
          {groups.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('trans.material')}</TableHead>
                  <TableHead className="w-40">{t('trash.type')}</TableHead>
                  <TableHead>{t('trans.versions')}</TableHead>
                  <TableHead className="w-32">{t('list.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const byLang = new Map(group.items.map((item) => [item.lang, item]));
                  const label = byLang.get(group.sourceLang) ?? group.items[0];
                  const canAdd = may('translations.edit') || may(`${group.type}.create`);
                  return (
                    <TableRow key={group.id}>
                      <TableCell className="max-w-sm align-top">
                        <Link href={adminEditPath(group.type, label.id)} className="font-medium hover:underline">
                          {label.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          /{label.slug}
                          <span title={label.id} className="ml-2 font-mono">
                            #{label.id.slice(-6)}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('trans.source')}: <span className="uppercase">{group.sourceLang}</span>
                        </p>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">{typeLabel(locale, group.type)}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          {languages.map((language) => {
                            const version = byLang.get(language.code);
                            if (version) {
                              return (
                                <Link
                                  key={language.code}
                                  href={adminEditPath(group.type, version.id)}
                                  title={`${language.nativeName || language.name} · ${version.title}`}
                                  className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                                >
                                  <span className="uppercase font-medium">{language.code}</span>
                                  <StatusPill status={version.status} label={statusLabel(locale, version.status)} className="ml-1" />
                                </Link>
                              );
                            }
                            if (!canAdd) {
                              return (
                                <span key={language.code} className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground uppercase">
                                  {language.code}
                                </span>
                              );
                            }
                            return (
                              <form key={language.code} action={addTranslationVersion}>
                                <input type="hidden" name="group" value={group.id} />
                                <input type="hidden" name="lang" value={language.code} />
                                <input type="hidden" name="back" value={self} />
                                <Button type="submit" size="sm" variant="outline" title={t('trans.addHint')}>
                                  + {language.code.toUpperCase()}
                                </Button>
                              </form>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">{formatDate(group.updatedAt, locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="px-1 py-10 text-center">
              <p className="text-sm text-muted-foreground">{hasFilters ? t('list.noResults') : t('trans.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {pageCount > 1 ? (
        <nav aria-label={t('list.pageOf')} className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/translations${translationsQuery(filters, { page: page - 1 })}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/translations${translationsQuery(filters, { page: page + 1 })}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
