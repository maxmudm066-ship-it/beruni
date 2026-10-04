import Link from 'next/link';
import { AlertTriangle, CircleCheck, Link2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { SECTION_SHAPES, isSectionType } from '@/lib/admin/homepage-sections';
import { LINK_REASON_KEYS, isLinkReason, type LinkReason } from '@/lib/admin/link-check';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { checkLinks } from './actions';
import { LINK_NOTICES } from './notices';

interface Finding {
  url: string;
  status: string;
  reason: LinkReason;
}

/** An old row may hold anything in this column, so an unknown token falls back to the plain one. */
function reasonOf(stored: string | null): LinkReason {
  return stored && isLinkReason(stored) ? stored : 'not_found';
}

interface Place {
  key: string;
  label: string;
  href: string | null;
  findings: Finding[];
}

/**
 * Link Checker: one sweep over the addresses the site holds — material texts, menus and homepage
 * buttons. A person sees which page is affected and what to open to fix it.
 */
export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('linkcheck.run');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const noticeKey = typeof query.notice === 'string' ? LINK_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';

  const run = await prisma.linkCheckRun.findFirst({ orderBy: { startedAt: 'desc' } });
  const rows = run
    ? await prisma.linkCheck.findMany({
        where: { runId: run.id },
        orderBy: [{ status: 'asc' }, { pagePath: 'asc' }],
        take: 400,
      })
    : [];

  const groupIds = [...new Set(rows.map((row) => row.pageGroupId).filter((id): id is string => Boolean(id)))];
  const menuIds = [...new Set(rows.map((row) => row.pagePath).filter((p): p is string => !!p && p.startsWith('/admin/menus/')).map((p) => p.split('/')[3]))];
  const sectionIds = [...new Set(rows.map((row) => row.pagePath).filter((p): p is string => !!p && p.startsWith('/admin/homepage/')).map((p) => p.split('/')[3]))];

  const [items, menus, sections] = await Promise.all([
    groupIds.length
      ? prisma.contentItem.findMany({
          where: { groupId: { in: groupIds }, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: { id: true, groupId: true, lang: true, title: true, group: { select: { type: true } } },
        })
      : Promise.resolve([]),
    menuIds.length ? prisma.menu.findMany({ where: { id: { in: menuIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sectionIds.length ? prisma.homepageSection.findMany({ where: { id: { in: sectionIds } }, select: { id: true, type: true } }) : Promise.resolve([]),
  ]);

  const itemByGroup = new Map(items.map((item) => [item.groupId, item]));
  const menuById = new Map(menus.map((menu) => [menu.id, menu]));
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  const places = new Map<string, Place>();
  for (const row of rows) {
    const key = row.pagePath ?? 'unknown';
    let place = places.get(key);
    if (!place) {
      place = { key, label: t('links.unknownWhere'), href: null, findings: [] };
      if (row.pagePath?.startsWith('/admin/menus/')) {
        const menu = menuById.get(row.pagePath.split('/')[3]);
        place.label = menu ? `${t('links.inMenu')} «${menu.name}»` : t('links.inMenu');
        place.href = row.pagePath;
      } else if (row.pagePath?.startsWith('/admin/homepage/')) {
        const section = sectionById.get(row.pagePath.split('/')[3]);
        const label = section && isSectionType(section.type) ? t(SECTION_SHAPES[section.type].labelKey) : '';
        place.label = label ? `${t('links.inBlock')} «${label}»` : t('links.inBlock');
        place.href = row.pagePath;
      } else if (row.pageGroupId) {
        const item = itemByGroup.get(row.pageGroupId);
        place.label = item?.title ?? row.pagePath ?? t('links.unknownWhere');
        place.href = item ? `/admin/${item.group.type}/${item.id}` : null;
      } else if (row.pagePath) {
        place.label = row.pagePath;
      }
      places.set(key, place);
    }
    place.findings.push({
      url: row.url,
      status: row.status,
      reason: reasonOf(row.errorMessage),
    });
  }

  const broken = rows.filter((row) => row.status === 'broken').length;
  const redirects = rows.length - broken;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('links.title')} description={t('links.subtitle')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('links.lastCheck')}</CardTitle>
          <CardDescription>
            {run
              ? run.status === 'running'
                ? t('links.running')
                : run.status === 'failed'
                  ? t('links.failed')
                  : formatDateTime(run.startedAt, locale)
              : t('links.never')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {run && run.status !== 'running' ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span>
                {t('links.lookedAt')}: <strong>{run.checkedCount}</strong>
              </span>
              <span>
                {t('links.problemCount')}: <strong>{run.brokenCount}</strong>
              </span>
              {redirects ? (
                <span className="text-muted-foreground">
                  {t('links.statusRedirect')}: <strong>{redirects}</strong>
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t('links.checkNote')}</p>
          <form action={checkLinks}>
            <Button type="submit" size="sm">
              <Link2 />
              {t('links.check')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {!run ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">{t('links.notRun')}</CardContent>
        </Card>
      ) : places.size === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 pt-6 text-sm">
            <CircleCheck className="size-5 shrink-0 text-primary" />
            {t('links.none')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...places.values()].map((place) => (
            <Card key={place.key}>
              <CardHeader className="space-y-0">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base normal-case tracking-normal">
                  <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  {place.href ? (
                    <Link href={place.href} className="underline-offset-4 hover:underline">
                      {place.label}
                    </Link>
                  ) : (
                    place.label
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="border-t pt-4">
                <ul className="space-y-2">
                  {place.findings.map((finding, index) => (
                    <li key={`${finding.url}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant={finding.status === 'broken' ? 'destructive' : 'secondary'} className="font-normal">
                        {t(finding.status === 'broken' ? 'links.statusBroken' : 'links.statusRedirect')}
                      </Badge>
                      {finding.url ? <span className="font-mono text-xs break-all">{finding.url}</span> : null}
                      <span className="text-muted-foreground">{t(LINK_REASON_KEYS[finding.reason])}</span>
                    </li>
                  ))}
                </ul>
                {place.href ? (
                  <Button asChild size="sm" variant="outline" className="mt-4">
                    <Link href={place.href}>{t('links.open')}</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
