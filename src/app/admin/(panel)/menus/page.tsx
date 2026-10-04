import Link from 'next/link';
import { ChevronRight, EyeOff, Plus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createMenu, deleteMenu } from './actions';
import { MENU_NOTICES } from './notices';

function locationLabel(t: (key: TranslationKey) => string, location: string | null): string {
  if (location === 'header') return t('menu.locationHeader');
  if (location === 'footer') return t('menu.locationFooter');
  return t('menu.locationOther');
}

/**
 * Menu Manager, first screen: the menus themselves. The header and the footer of the site are
 * both edited here, so a content manager never has to know which template reads which menu.
 */
export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('menus.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const menus = await prisma.menu.findMany({
    orderBy: [{ location: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  });

  const confirmId = typeof query.delete === 'string' ? query.delete : '';
  const noticeKey = typeof query.notice === 'string' ? MENU_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('menu.title')} description={t('menu.note')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <div className="space-y-3">
        {menus.map((menu) => (
          <Card key={menu.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {menu.name}
                  {menu.isActive ? null : (
                    <Badge variant="secondary" className="gap-1 font-normal">
                      <EyeOff className="size-3" />
                      {t('menu.notShown')}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {locationLabel(t, menu.location)} · {t('menu.itemsCount')}: {menu._count.items}
                </CardDescription>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href={`/admin/menus/${menu.id}`}>
                    {t('menu.open')}
                    <ChevronRight />
                  </Link>
                </Button>
              </div>
            </CardHeader>

            {confirmId === menu.id ? (
              <CardContent className="border-t pt-4">
                <p className="text-sm text-destructive">{t('menu.deleteHint')}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={deleteMenu}>
                    <input type="hidden" name="id" value={menu.id} />
                    <input type="hidden" name="back" value="/admin/menus" />
                    <Button type="submit" size="sm" variant="destructive">
                      {t('menu.delete')}
                    </Button>
                  </form>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/admin/menus">{t('common.cancel')}</Link>
                  </Button>
                </div>
              </CardContent>
            ) : (
              <CardContent className="border-t pt-4">
                <Button asChild size="sm" variant="ghost" className="text-destructive">
                  <Link href={`/admin/menus?delete=${menu.id}`}>{t('menu.delete')}</Link>
                </Button>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t('menu.create')}</CardTitle>
          <CardDescription>{t('menu.nameHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createMenu} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="back" value="/admin/menus" />
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="menu-name" className="text-xs text-muted-foreground">
                {t('menu.name')}
              </label>
              <Input id="menu-name" name="name" required maxLength={80} />
            </div>

            <div className="space-y-1">
              <label htmlFor="menu-location" className="text-xs text-muted-foreground">
                {t('menu.location')}
              </label>
              <select
                id="menu-location"
                name="location"
                className="h-9 min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="header">{t('menu.locationHeader')}</option>
                <option value="footer">{t('menu.locationFooter')}</option>
                <option value="other">{t('menu.locationOther')}</option>
              </select>
            </div>

            <Button type="submit" size="sm" className="h-9">
              <Plus />
              {t('menu.create')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
