import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { adminEditPath } from '@/lib/content/routes';
import { sanitizeContentHtml } from '@/lib/content/html';
import { SCHEDULED_REVISION_SUMMARY } from '@/lib/content/schedule';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { restoreRevision } from '../../actions';

/** Snapshots older than this are still kept, but the list shows the most recent hundred. */
const VERSION_WINDOW = 100;

const NOTICE: Record<string, TranslationKey> = {
  denied: 'bulk.denied',
  missing: 'list.noResults',
};

/**
 * Version history of one language version: every save, review decision and restore is a row, and
 * restoring writes a new row instead of overwriting the one being replaced.
 */
export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type, id } = await params;
  const def = CONTENT_TYPE_MAP.get(type);
  if (!def) notFound();

  const user = await requirePermission(`${def.key}.view`);
  const item = await prisma.contentItem.findFirst({
    where: { id, group: { type: def.key }, deletedAt: null },
    select: { id: true, title: true, slug: true, lang: true, status: true, revision: true },
  });
  if (!item) notFound();

  const query = await searchParams;
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const self = `/admin/${def.key}/${item.id}/versions`;

  const [revisions, total] = await Promise.all([
    prisma.contentRevision.findMany({
      where: { itemId: item.id },
      include: { changedBy: { select: { displayName: true } } },
      orderBy: { version: 'desc' },
      take: VERSION_WINDOW,
    }),
    prisma.contentRevision.count({ where: { itemId: item.id } }),
  ]);

  const noticeValue = typeof query.restored === 'string' ? query.restored : '';
  const notice = NOTICE[noticeValue]
    ? t(NOTICE[noticeValue])
    : noticeValue
      ? `${t('ver.restored')}: v${noticeValue}`
      : '';

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={`${t('ver.title')}: ${item.title}`}
        description={t('ver.note')}
        backHref={adminEditPath(def.key, item.id)}
        backLabel={t('ver.openMaterial')}
      />

      {notice ? (
        <p
          className={
            noticeValue === 'denied' || noticeValue === 'missing'
              ? 'mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
              : 'mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm'
          }
          role="status"
        >
          {notice}
        </p>
      ) : null}

      <p className="mb-4 text-xs text-muted-foreground">
        {t('list.language')}: <span className="uppercase">{item.lang}</span> · /{item.slug} ·{' '}
        <StatusPill status={item.status} label={statusLabel(locale, item.status)} className="ml-1 align-middle" />
      </p>

      <Card>
        <CardContent className="pt-0">
          {revisions.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('ver.versionOf')}</TableHead>
                  <TableHead>{t('ver.changes')}</TableHead>
                  <TableHead className="w-40">{t('ver.savedBy')}</TableHead>
                  <TableHead className="w-44">{t('ver.when')}</TableHead>
                  <TableHead className="w-32">{t('list.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => (
                  <TableRow key={revision.id}>
                    <TableCell className="font-mono text-sm">
                      v{revision.version}
                      {revision.version === item.revision ? <span className="ml-2 text-xs text-muted-foreground">{t('ver.current')}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm">
                        {revision.changeSummary === SCHEDULED_REVISION_SUMMARY
                          ? t('ver.scheduled')
                          : revision.changeSummary?.trim() || t('ver.nothingChanged')}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{revision.title}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-primary">{t('ver.view')}</summary>
                        <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t('ver.was')}: {formatDateTime(revision.createdAt, locale)} · /{revision.slug}
                          </p>
                          {revision.excerpt ? <p className="text-sm">{revision.excerpt}</p> : null}
                          {revision.body ? (
                            <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(revision.body) }} />
                          ) : (
                            <p className="text-sm text-muted-foreground">{t('ver.noText')}</p>
                          )}
                        </div>
                      </details>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{revision.changedBy?.displayName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(revision.createdAt, locale)}</TableCell>
                    <TableCell>
                      {revision.version === item.revision ? (
                        <span className="text-xs text-muted-foreground">{t('ver.current')}</span>
                      ) : (
                        <form action={restoreRevision}>
                          <input type="hidden" name="type" value={def.key} />
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="version" value={revision.version} />
                          <input type="hidden" name="back" value={self} />
                          <Button type="submit" size="sm" variant="outline" title={t('ver.restoreHint')}>
                            {t('ver.restore')}
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-1 py-10 text-center text-sm text-muted-foreground">{t('ver.empty')}</p>
          )}
        </CardContent>
      </Card>

      {total > revisions.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t('ver.window')}: {revisions.length} / {total}
        </p>
      ) : null}
    </div>
  );
}
