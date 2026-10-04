import Link from 'next/link';
import { X } from 'lucide-react';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { PAGE_SIZE } from '@/lib/admin/list-query';
import { CONTENT_TYPES } from '@/lib/content-types';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TYPE_KEYS = new Set(CONTENT_TYPES.map((type) => type.key));

/** The word before the first dot groups actions: `content.publish` and `media.upload` are different areas. */
function areaOf(action: string): string {
  return action.split('.')[0] ?? action;
}

interface Area {
  key: string;
  labelKey: TranslationKey;
  /** Several action families can belong to one place in the menu: sign-in, password and 2FA are one account area. */
  prefixes: string[];
}

/** Areas read like the menu, so a log entry names a place a person can already find in the sidebar. */
const AREAS: Area[] = [
  { key: 'content', labelKey: 'nav.content', prefixes: ['content'] },
  { key: 'media', labelKey: 'nav.mediaLibrary', prefixes: ['media'] },
  { key: 'menu', labelKey: 'nav.menus', prefixes: ['menu'] },
  { key: 'homepage', labelKey: 'nav.homepage', prefixes: ['homepage'] },
  { key: 'translations', labelKey: 'nav.translations', prefixes: ['translations'] },
  { key: 'redirect', labelKey: 'nav.redirects', prefixes: ['redirect'] },
  { key: 'import', labelKey: 'nav.importExport', prefixes: ['import'] },
  { key: 'linkcheck', labelKey: 'nav.links', prefixes: ['linkcheck'] },
  { key: 'trash', labelKey: 'nav.trash', prefixes: ['trash'] },
  { key: 'contact_messages', labelKey: 'nav.contactMessages', prefixes: ['contact_messages'] },
  { key: 'settings', labelKey: 'nav.settings', prefixes: ['settings'] },
  { key: 'users', labelKey: 'nav.users', prefixes: ['user'] },
  { key: 'roles', labelKey: 'nav.roles', prefixes: ['role'] },
  { key: 'account', labelKey: 'auditLog.areaAccount', prefixes: ['login', 'logout', 'password', 'two_factor', 'session', 'security'] },
];

/** A key the screen does not know is still a real prefix: filter by it rather than ignore it. */
function prefixesFor(areaKey: string): string[] {
  const area = AREAS.find((candidate) => candidate.key === areaKey);
  return area ? area.prefixes : [areaKey];
}

interface AuditFilters {
  q: string;
  area: string;
  userId: string;
  page: number;
}

function parseFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const text = (key: string) => (typeof params[key] === 'string' ? params[key].trim() : '');
  const page = Number.parseInt(text('page'), 10);
  return { q: text('q').slice(0, 120), area: text('area').slice(0, 40), userId: text('userId').slice(0, 40), page: Number.isFinite(page) && page > 1 ? page : 1 };
}

function auditQuery(filters: AuditFilters, overrides: Partial<AuditFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const search = new URLSearchParams();
  if (merged.q) search.set('q', merged.q);
  if (merged.area) search.set('area', merged.area);
  if (merged.userId) search.set('userId', merged.userId);
  if (merged.page > 1) search.set('page', String(merged.page));
  const query = search.toString();
  return query ? `?${query}` : '';
}

/** One line of JSON, ready to read; anything unparsable is shown as it was stored. */
function payloadText(payload: string | null): string {
  if (!payload) return '';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

/**
 * Activity log: who did what and when. Entries are written by the actions themselves and can never be
 * edited or removed from here, which is the point of keeping them.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('audit.view');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const isSuperAdmin = user.permissions.includes('*');

  const query = await searchParams;
  const filters = parseFilters(query);

  const and: Prisma.AuditLogWhereInput[] = [];
  if (filters.area) and.push({ OR: prefixesFor(filters.area).map((prefix) => ({ action: { startsWith: prefix } })) });
  if (filters.userId) and.push({ userId: filters.userId });
  if (filters.q) {
    and.push({
      OR: [
        { description: { contains: filters.q } },
        { action: { contains: filters.q } },
        { entityId: { contains: filters.q } },
      ],
    });
  }
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};

  const [rows, total, actionRows, actorRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
    prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { not: null } }, _count: { _all: true }, orderBy: { _count: { userId: 'desc' } } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);

  // The filter must not offer areas or people that the current search cannot return, so both lists are
  // read from the log itself; the labels need a name lookup for the people.
  const actorIds = actorRows.map((row) => row.userId).filter((id): id is string => Boolean(id));
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }) : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.displayName]));
  const usedPrefixes = new Set(actionRows.map((row) => areaOf(row.action)));
  const knownPrefixes = new Set(AREAS.flatMap((area) => area.prefixes));
  const areaOptions = [
    ...AREAS.filter((area) => area.prefixes.some((prefix) => usedPrefixes.has(prefix))).map((area) => ({
      key: area.key,
      label: t(area.labelKey),
    })),
    // A family this screen has never seen stays filterable under its own name.
    ...[...usedPrefixes].filter((prefix) => !knownPrefixes.has(prefix)).map((prefix) => ({ key: prefix, label: prefix })),
  ];

  // A log line is only useful if it opens on the thing it talks about, and that thing may be gone.
  const contentIds = rows.filter((row) => row.entityId && TYPE_KEYS.has(row.entityType)).map((row) => row.entityId as string);
  const targetIds = rows.filter((row) => row.entityId && row.entityType === 'user').map((row) => row.entityId as string);
  const [contentTargets, userTargets] = await Promise.all([
    contentIds.length
      ? prisma.contentItem.findMany({ where: { id: { in: contentIds }, deletedAt: null }, select: { id: true, title: true } })
      : Promise.resolve([]),
    targetIds.length ? prisma.user.findMany({ where: { id: { in: targetIds } }, select: { id: true, displayName: true } }) : Promise.resolve([]),
  ]);
  const targets = new Map<string, { label: string; href: string }>();
  for (const item of contentTargets) {
    const type = rows.find((row) => row.entityId === item.id)?.entityType ?? '';
    targets.set(item.id, { label: item.title, href: `/admin/${type}/${item.id}` });
  }
  for (const person of userTargets) targets.set(person.id, { label: person.displayName, href: `/admin/users/${person.id}` });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title={t('auditLog.title')} description={t('auditLog.subtitle')} />

      <form method="get" action="/admin/audit" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-1">
          <label htmlFor="audit-q" className="text-xs text-muted-foreground">
            {t('list.search')}
          </label>
          <Input id="audit-q" name="q" defaultValue={filters.q} placeholder={t('auditLog.searchPlaceholder')} className="max-w-md" />
        </div>

        <div className="space-y-1">
          <label htmlFor="audit-area" className="text-xs text-muted-foreground">
            {t('auditLog.area')}
          </label>
          <select id="audit-area" name="area" defaultValue={filters.area} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('auditLog.allAreas')}</option>
            {areaOptions.map((area) => (
              <option key={area.key} value={area.key}>
                {area.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="audit-user" className="text-xs text-muted-foreground">
            {t('auditLog.who')}
          </label>
          <select id="audit-user" name="userId" defaultValue={filters.userId} className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="">{t('auditLog.everyone')}</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.displayName}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" size="sm" className="h-9">
          {t('list.search')}
        </Button>

        {filters.q || filters.area || filters.userId ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-muted-foreground">
            <Link href="/admin/audit">
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
              <p className="text-sm text-muted-foreground">{filters.q || filters.area || filters.userId ? t('list.noResults') : t('auditLog.empty')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t('auditLog.when')}</TableHead>
                  <TableHead className="w-40">{t('auditLog.who')}</TableHead>
                  <TableHead>{t('auditLog.what')}</TableHead>
                  <TableHead className="w-56">{t('auditLog.where')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const target = row.entityId ? targets.get(row.entityId) : undefined;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDateTime(row.createdAt, locale)}</TableCell>
                      <TableCell className="text-sm">
                        {row.userId ? row.user?.displayName ?? actorNames.get(row.userId) ?? t('auditLog.unknown') : '—'}
                      </TableCell>
                      <TableCell className="max-w-xl">
                        <p className="text-sm">{row.description}</p>
                        {isSuperAdmin ? (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-muted-foreground">{t('auditLog.details')}</summary>
                            <p className="mt-1 font-mono text-xs break-all">
                              {row.action}
                              {row.entityType ? ` · ${row.entityType}` : ''}
                              {row.entityId ? ` · #${row.entityId.slice(-6)}` : ''}
                              {row.ip ? ` · ${row.ip}` : ''}
                            </p>
                            {payloadText(row.payload) ? (
                              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted px-2 py-1 font-mono text-xs">{payloadText(row.payload)}</pre>
                            ) : null}
                          </details>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {target ? (
                          <Link href={target.href} className="line-clamp-2 underline-offset-4 hover:underline">
                            {target.label}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
              <Link href={`/admin/audit${auditQuery(filters, { page: page - 1 })}`}>{t('list.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('list.pageOf')} {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/audit${auditQuery(filters, { page: page + 1 })}`}>{t('list.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
