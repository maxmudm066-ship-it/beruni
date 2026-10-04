import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { typeLabel } from '@/lib/content/material-read';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { linkMenuMaterial } from '../../actions';
import { MENU_NOTICES } from '../../notices';

const RESULT_LIMIT = 60;

interface Candidate {
  groupId: string;
  type: string;
  title: string;
  lang: string;
}

/** One row per material: a material exists in up to three languages but is linked once. */
function uniqueByGroup(rows: { lang: string; title: string; group: { id: string; type: string } }[], locale: AdminLocale): Candidate[] {
  const byGroup = new Map<string, Candidate>();
  for (const row of rows) {
    const current = byGroup.get(row.group.id);
    const better =
      !current || (row.lang === locale && current.lang !== locale) || (row.lang === 'ru' && current.lang !== locale);
    if (better) {
      byGroup.set(row.group.id, { groupId: row.group.id, type: row.group.type, title: row.title, lang: row.lang });
    }
  }
  return [...byGroup.values()];
}

/**
 * Material picker for a menu item. It writes the link straight onto an already saved item and
 * returns to the editor, which keeps the editor itself a single plain form.
 */
export default async function MenuMaterialPickerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('menus.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const { id } = await params;
  const query = await searchParams;

  const itemId = typeof query.item === 'string' ? query.item : '';
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 120) : '';
  // An empty search still lists materials: staff who do not remember a title need somewhere to start.
  const searched = query.q !== undefined;

  const [menu, item] = await Promise.all([
    prisma.menu.findUnique({ where: { id }, select: { id: true, name: true } }),
    itemId
      ? prisma.menuItem.findFirst({
          where: { id: itemId, menuId: id },
          select: { id: true, translations: { select: { lang: true, title: true } } },
        })
      : null,
  ]);
  if (!menu || !item) notFound();

  const back = `/admin/menus/${menu.id}/item/${item.id}`;
  const results = searched
    ? uniqueByGroup(
        await prisma.contentItem.findMany({
          where: { deletedAt: null, status: 'published', ...(q ? { title: { contains: q } } : {}) },
          select: { lang: true, title: true, group: { select: { id: true, type: true } } },
          orderBy: { title: 'asc' },
          take: RESULT_LIMIT,
        }),
        locale,
      )
    : [];

  const itemTitle =
    item.translations.find((row) => row.lang === locale)?.title ??
    item.translations.find((row) => row.lang === 'ru')?.title ??
    item.translations[0]?.title ??
    '';

  const noticeKey = typeof query.notice === 'string' ? MENU_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={t('menu.pickMaterial')}
        description={`${menu.name} · ${itemTitle}`}
        backHref={back}
        backLabel={t('menu.backToItems')}
      />

      {notice ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('menu.searchMaterial')}</CardTitle>
          <CardDescription>{t('menu.searchMaterialHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="item" value={item.id} />
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="pick-q" className="text-xs text-muted-foreground">
                {t('common.search')}
              </label>
              <Input id="pick-q" name="q" defaultValue={q} maxLength={120} />
            </div>
            <Button type="submit" size="sm" className="h-9">
              <Search />
              {t('list.search')}
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-9">
              <Link href={back}>{t('common.cancel')}</Link>
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched ? (
        <Card className="mt-4">
          <CardContent className="pt-0">
            {results.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.title')}</TableHead>
                    <TableHead className="w-44">{t('trash.type')}</TableHead>
                    <TableHead className="w-16">{t('list.language')}</TableHead>
                    <TableHead className="w-64">{t('list.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((candidate) => (
                    <TableRow key={candidate.groupId}>
                      <TableCell className="font-medium">{candidate.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {typeLabel(locale, candidate.type)}
                      </TableCell>
                      <TableCell className="uppercase">{candidate.lang}</TableCell>
                      <TableCell>
                        <form action={linkMenuMaterial}>
                          <input type="hidden" name="item" value={item.id} />
                          <input type="hidden" name="group" value={candidate.groupId} />
                          <input type="hidden" name="back" value={back} />
                          <Button type="submit" size="sm" variant="outline">
                            {t('menu.linkMaterial')}
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="px-1 py-8 text-center text-sm text-muted-foreground">{t('menu.noMaterials')}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
