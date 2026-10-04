import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  CornerLeftUp,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { MENU_MAX_DEPTH } from '@/lib/admin/reorder';
import { PageHeader } from '@/components/admin/page-header';
import { ReorderList, type ReorderRow } from '@/components/admin/reorder-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deleteMenuItem, moveMenuItem, saveMenuOrder, toggleMenuItem, updateMenu } from '../actions';
import { MENU_NOTICES } from '../notices';

type MenuRowItem = {
  id: string;
  sortOrder: number;
  parentId: string | null;
  targetUrl: string | null;
  targetType: string;
  isVisible: boolean;
  openInNewTab: boolean;
  isMegaMenu: boolean;
  translations: { lang: string; title: string }[];
};

type MenuRow = {
  item: MenuRowItem;
  depth: number;
  /** Position among its own siblings, so a button that could not move anything is not offered. */
  isFirst: boolean;
  isLast: boolean;
};

/** Depth-first walk so the list on screen is the list the visitor's menu is built from. */
function flatten(items: MenuRowItem[]): MenuRow[] {
  const children = new Map<string | null, MenuRowItem[]>();
  for (const item of items) {
    const bucket = children.get(item.parentId) ?? [];
    bucket.push(item);
    children.set(item.parentId, bucket);
  }
  for (const bucket of children.values()) bucket.sort((a, b) => a.sortOrder - b.sortOrder);

  const rows: MenuRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const siblings = children.get(parentId) ?? [];
    siblings.forEach((item, position) => {
      rows.push({ item, depth, isFirst: position === 0, isLast: position === siblings.length - 1 });
      walk(item.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

function RowAction({
  action,
  item,
  back,
  label,
  icon: Icon,
  extra,
  variant = 'ghost',
  destructive = false,
  disabled = false,
}: {
  action: (form: FormData) => Promise<void>;
  item: string;
  back: string;
  label: string;
  icon: LucideIcon;
  extra?: Record<string, string>;
  variant?: 'ghost' | 'outline';
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="item" value={item} />
      <input type="hidden" name="back" value={back} />
      {Object.entries(extra ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        size="sm"
        variant={variant}
        title={label}
        disabled={disabled}
        className={destructive ? 'h-7 px-2 text-destructive' : 'h-7 px-2 text-muted-foreground'}
      >
        <Icon />
        <span className="sr-only sm:not-sr-only">{label}</span>
      </Button>
    </form>
  );
}

/**
 * One menu, item by item. Dragging is the fast path; every action also exists as a button, so
 * the screen is fully usable without a mouse that can drag and without JavaScript at all.
 */
export default async function MenuEditorPage({
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

  const [menu, languages] = await Promise.all([
    prisma.menu.findUnique({
      where: { id },
      include: {
        items: {
          select: {
            id: true,
            sortOrder: true,
            parentId: true,
            targetUrl: true,
            targetType: true,
            isVisible: true,
            openInNewTab: true,
            isMegaMenu: true,
            translations: { select: { lang: true, title: true } },
          },
        },
      },
    }),
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nativeName: true },
    }),
  ]);
  if (!menu) notFound();

  const back = `/admin/menus/${menu.id}`;
  const rows = flatten(menu.items);
  const noticeKey = typeof query.notice === 'string' ? MENU_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const confirmId = typeof query.delete === 'string' ? query.delete : '';

  const title = (item: MenuRowItem) =>
    item.translations.find((row) => row.lang === locale)?.title ??
    item.translations.find((row) => row.lang === 'ru')?.title ??
    item.translations[0]?.title ??
    t('menu.notFound');

  const reorderRows: ReorderRow[] = rows.map(({ item, depth, isFirst, isLast }) => {
    const missing = languages
      .filter((language) => !item.translations.some((row) => row.lang === language.code))
      .map((language) => language.code.toUpperCase());

    return {
      id: item.id,
      depth,
      content: (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{title(item)}</span>
            {item.targetUrl ? (
              <span className="truncate font-mono text-xs text-muted-foreground">{item.targetUrl}</span>
            ) : null}
            {item.targetType === 'external' ? <ExternalLink className="size-3.5 text-muted-foreground" /> : null}
            {item.isMegaMenu ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <LayoutGrid className="size-3" />
                {t('menu.mega')}
              </Badge>
            ) : null}
            {item.openInNewTab ? <Badge variant="outline" className="font-normal">{t('menu.newTab')}</Badge> : null}
            {item.isVisible ? null : (
              <Badge variant="secondary" className="gap-1 font-normal">
                <EyeOff className="size-3" />
                {t('menu.hiddenBadge')}
              </Badge>
            )}
            {missing.length ? (
              <span className="text-xs text-amber-600 dark:text-amber-500">
                {t('trans.missing')}: {missing.join(', ')}
              </span>
            ) : null}
          </div>

          {confirmId === item.id ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="text-xs text-destructive">{t('menu.deleteItemHint')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <RowAction action={deleteMenuItem} item={item.id} back={back} label={t('menu.deleteItem')} icon={Trash2} variant="outline" destructive />
                <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                  <Link href={back}>{t('common.cancel')}</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              <Button asChild size="sm" variant="outline" className="h-7 px-2">
                <Link href={`/admin/menus/${menu.id}/item/${item.id}`}>
                  <Pencil />
                  {t('menu.editItem')}
                </Link>
              </Button>
              <RowAction action={moveMenuItem} item={item.id} back={back} label={t('order.moveUp')} icon={ArrowUp} extra={{ direction: 'up' }} disabled={isFirst} />
              <RowAction action={moveMenuItem} item={item.id} back={back} label={t('order.moveDown')} icon={ArrowDown} extra={{ direction: 'down' }} disabled={isLast} />
              {depth < MENU_MAX_DEPTH && !isFirst ? (
                <RowAction
                  action={moveMenuItem}
                  item={item.id}
                  back={back}
                  label={t('menu.indent')}
                  icon={CornerDownRight}
                  extra={{ direction: 'indent' }}
                />
              ) : null}
              {depth > 0 ? (
                <RowAction
                  action={moveMenuItem}
                  item={item.id}
                  back={back}
                  label={t('menu.outdent')}
                  icon={CornerLeftUp}
                  extra={{ direction: 'outdent' }}
                />
              ) : null}
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground">
                <Link href={`/admin/menus/${menu.id}/item/new?parent=${item.id}`} title={t('menu.addChild')}>
                  <Plus />
                  <span className="sr-only sm:not-sr-only">{t('menu.addChild')}</span>
                </Link>
              </Button>
              <RowAction
                action={toggleMenuItem}
                item={item.id}
                back={back}
                label={item.isVisible ? t('menu.hide') : t('menu.show')}
                icon={item.isVisible ? Eye : EyeOff}
              />
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-destructive">
                <Link href={`${back}?delete=${item.id}`} title={t('menu.deleteItem')}>
                  <Trash2 />
                  <span className="sr-only">{t('menu.deleteItem')}</span>
                </Link>
              </Button>
            </div>
          )}
        </div>
      ),
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={menu.name}
        description={t('menu.editorNote')}
        backHref="/admin/menus"
        backLabel={t('menu.backToMenus')}
        actions={
          <Button asChild size="sm">
            <Link href={`/admin/menus/${menu.id}/item/new`}>
              <Plus />
              {t('menu.addItem')}
            </Link>
          </Button>
        }
      />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t('menu.settingsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateMenu} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={menu.id} />
            <input type="hidden" name="back" value={back} />

            <div className="min-w-52 flex-1 space-y-1">
              <label htmlFor="menu-name" className="text-xs text-muted-foreground">
                {t('menu.name')}
              </label>
              <Input id="menu-name" name="name" defaultValue={menu.name} required maxLength={80} />
            </div>

            <div className="space-y-1">
              <label htmlFor="menu-location" className="text-xs text-muted-foreground">
                {t('menu.location')}
              </label>
              <select
                id="menu-location"
                name="location"
                defaultValue={menu.location ?? 'other'}
                className="h-9 min-w-56 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="header">{t('menu.locationHeader')}</option>
                <option value="footer">{t('menu.locationFooter')}</option>
                <option value="other">{t('menu.locationOther')}</option>
              </select>
            </div>

            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={menu.isActive} className="size-4 accent-primary" />
              {t('menu.active')}
            </label>

            <Button type="submit" size="sm" className="h-9">
              {t('common.save')}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">{t('menu.activeHint')}</p>
        </CardContent>
      </Card>

      <h2 className="mb-2 font-heading text-lg font-semibold">{t('menu.editorTitle')}</h2>

      {reorderRows.length ? (
        <ReorderList
          rows={reorderRows}
          maxDepth={MENU_MAX_DEPTH}
          action={saveMenuOrder}
          context={{ id: menu.id, back }}
          labels={{ drag: t('order.drag'), saving: t('order.saving'), list: t('menu.editorTitle') }}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t('menu.empty')}</p>
      )}
    </div>
  );
}
