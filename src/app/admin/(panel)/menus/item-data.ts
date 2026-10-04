import { prisma } from '@/lib/db';
import type { MenuItemFormParent, MenuItemFormValues } from '@/components/admin/menu-item-form';
import type { AdminLocale } from '@/lib/admin/labels';
import { isMenuTargetType, normalizeMenuTarget, type MenuTargetType } from '@/lib/admin/menu-target';
import { MENU_MAX_DEPTH } from '@/lib/admin/reorder';

export interface MenuItemFormData {
  menu: { id: string; name: string };
  languages: { code: string; nativeName: string }[];
  parents: MenuItemFormParent[];
  values: MenuItemFormValues;
}

const EMPTY_VALUES: MenuItemFormValues = {
  parentId: null,
  targetType: 'page',
  targetUrl: '',
  isVisible: true,
  openInNewTab: false,
  isMegaMenu: false,
  titles: {},
  material: null,
};

function preferred(titles: { lang: string; title: string }[], locale: AdminLocale): string {
  return (
    titles.find((row) => row.lang === locale)?.title ??
    titles.find((row) => row.lang === 'ru')?.title ??
    titles[0]?.title ??
    ''
  );
}

/**
 * What the user had typed when a save was rejected. It travels back in the address bar so nobody
 * loses a half-filled form to a mistyped address; absent fields keep the stored values.
 */
export interface MenuItemDraft {
  titles: Record<string, string>;
  targetType?: string;
  targetUrl?: string;
  parentId?: string | null;
  isVisible?: boolean;
  openInNewTab?: boolean;
  isMegaMenu?: boolean;
}

const DRAFT_KEYS = ['targetType', 'targetUrl', 'parent', 'isVisible', 'openInNewTab', 'isMegaMenu'] as const;

export function readDraft(query: Record<string, string | string[] | undefined>): MenuItemDraft | null {
  const hasDraft = DRAFT_KEYS.some((key) => query[`d_${key}`] !== undefined) ||
    Object.keys(query).some((key) => key.startsWith('d_title_'));
  if (!hasDraft) return null;

  const one = (key: string) => {
    const value = query[`d_${key}`];
    return typeof value === 'string' ? value : undefined;
  };
  const titles: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('d_title_') && typeof value === 'string') titles[key.slice('d_title_'.length)] = value;
  }

  return {
    titles,
    targetType: one('targetType'),
    targetUrl: one('targetUrl'),
    parentId: one('parent') ?? null,
    isVisible: one('isVisible') === '1',
    openInNewTab: one('openInNewTab') === '1',
    isMegaMenu: one('isMegaMenu') === '1',
  };
}

function applyDraft(values: MenuItemFormValues, draft: MenuItemDraft | null): MenuItemFormValues {
  if (!draft) return values;
  const targetType: MenuTargetType = isMenuTargetType(draft.targetType)
    ? draft.targetType
    : isMenuTargetType(values.targetType)
      ? values.targetType
      : 'page';
  // Re-checked here: the address is rendered as an href for external links, so a value somebody
  // smuggled into the query string must not survive into the form.
  const normalized = normalizeMenuTarget(targetType, draft.targetUrl ?? values.targetUrl ?? '');
  return {
    ...values,
    titles: { ...values.titles, ...draft.titles },
    targetType,
    targetUrl: normalized.invalid ? '' : (normalized.url ?? values.targetUrl ?? ''),
    parentId: draft.parentId ?? values.parentId,
    isVisible: draft.isVisible ?? values.isVisible,
    openInNewTab: draft.openInNewTab ?? values.openInNewTab,
    isMegaMenu: draft.isMegaMenu ?? values.isMegaMenu,
  };
}

/**
 * Everything the item editor renders, in one query batch: the menu, the site languages, the
 * items that may become a parent, and the current values of the item being edited.
 */
export async function loadMenuItemForm(
  menuId: string,
  itemId: string | null,
  locale: AdminLocale,
  draft: MenuItemDraft | null = null,
): Promise<MenuItemFormData | null> {
  const menu = await prisma.menu.findUnique({ where: { id: menuId }, select: { id: true, name: true } });
  if (!menu) return null;

  const [languages, items, edited] = await Promise.all([
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { code: true, nativeName: true },
    }),
    prisma.menuItem.findMany({
      where: { menuId: menu.id },
      select: { id: true, parentId: true, sortOrder: true, translations: { select: { lang: true, title: true } } },
    }),
    itemId
      ? prisma.menuItem.findFirst({
          where: { id: itemId, menuId: menu.id },
          select: {
            id: true,
            parentId: true,
            targetType: true,
            targetUrl: true,
            isVisible: true,
            openInNewTab: true,
            isMegaMenu: true,
            contentGroupId: true,
            translations: { select: { lang: true, title: true } },
          },
        })
      : null,
  ]);
  if (itemId && !edited) return null;

  const material = edited?.contentGroupId
    ? await prisma.contentGroup.findFirst({
        where: { id: edited.contentGroupId, deletedAt: null },
        select: { id: true, items: { select: { lang: true, title: true }, orderBy: { createdAt: 'asc' } } },
      })
    : null;

  // An item cannot become its own parent, and neither can anything below it.
  const excluded = new Set<string>();
  if (edited) {
    const collect = (id: string) => {
      excluded.add(id);
      for (const child of items.filter((row) => row.parentId === id)) collect(child.id);
    };
    collect(edited.id);
  }

  const childrenOf = (parentId: string | null) =>
    items
      .filter((row) => row.parentId === parentId && !excluded.has(row.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const parents: MenuItemFormParent[] = [];
  const walk = (parentId: string | null, depth: number) => {
    if (depth >= MENU_MAX_DEPTH) return;
    for (const row of childrenOf(parentId)) {
      parents.push({ id: row.id, title: preferred(row.translations, locale), depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);

  const titles: Record<string, string> = {};
  for (const row of edited?.translations ?? []) titles[row.lang] = row.title;

  const stored: MenuItemFormValues = edited
    ? {
        parentId: edited.parentId,
        targetType: edited.targetType,
        targetUrl: edited.targetUrl ?? '',
        isVisible: edited.isVisible,
        openInNewTab: edited.openInNewTab,
        isMegaMenu: edited.isMegaMenu,
        titles,
        material: material
          ? {
              groupId: material.id,
              title: preferred(
                material.items.map((row) => ({ lang: row.lang, title: row.title })),
                locale,
              ),
            }
          : null,
      }
    : { ...EMPTY_VALUES, titles: {} };

  const values = applyDraft(stored, draft);
  // A parent that no longer exists (or the item itself) must not be offered back to the form.
  if (values.parentId && !parents.some((row) => row.id === values.parentId)) values.parentId = null;

  return { menu, languages, parents, values };
}
