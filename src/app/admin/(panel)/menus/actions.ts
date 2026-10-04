/**
 * Menu Manager writes: menus themselves, their items, the item tree order and the link to a
 * material. Everything here is reachable from a plain form post, so the screens keep working
 * with JavaScript turned off; drag-and-drop posts the same `saveMenuOrder` action.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import { isMenuTargetType, normalizeMenuTarget, type MenuTargetType } from '@/lib/admin/menu-target';
import { MENU_MAX_DEPTH, parseOrderPayload } from '@/lib/admin/reorder';
import { publicPath } from '@/lib/content/routes';
import { slugify, withSuffix } from '@/lib/slug';

const PERMISSION = 'menus.manage';

const LOCATIONS = ['header', 'footer', 'other'] as const;

function text(form: FormData, name: string, max = 200): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function flag(form: FormData, name: string): boolean {
  const raw = form.get(name);
  return raw === 'on' || raw === 'true' || raw === '1';
}

/** Only a Menu Manager URL may be returned to, so a crafted form cannot redirect off the screen. */
function backTo(form: FormData, fallback: string, notice?: string): never {
  const raw = form.get('back');
  const path = typeof raw === 'string' && raw.startsWith('/admin/menus') ? raw.slice(0, 300) : fallback;
  redirect(notice ? `${path}${path.includes('?') ? '&' : '?'}${notice}` : path);
}

const DRAFT_TITLE_MAX = 80;
const DRAFT_URL_MAX = 200;
const DRAFT_FLAGS = ['isVisible', 'openInNewTab', 'isMegaMenu'] as const;

/**
 * The contents of the item form, trimmed enough to travel in the address bar. `readDraft` on the
 * other side re-checks the address before it is shown again, so an unvalidated value never
 * reaches an href from here.
 */
function draftQuery(form: FormData, languages: string[]): string {
  const params = new URLSearchParams();
  for (const code of languages) {
    const value = text(form, `title:${code}`, DRAFT_TITLE_MAX);
    if (value) params.set(`d_title_${code}`, value);
  }
  const targetType = text(form, 'targetType', 20);
  if (isMenuTargetType(targetType)) params.set('d_targetType', targetType);
  const targetUrl = text(form, 'targetUrl', DRAFT_URL_MAX);
  if (targetUrl) params.set('d_targetUrl', targetUrl);
  const parent = text(form, 'parent', 40);
  if (parent) params.set('d_parent', parent);
  for (const name of DRAFT_FLAGS) params.set(`d_${name}`, flag(form, name) ? '1' : '0');
  return params.toString();
}

async function uniqueMenuKey(base: string): Promise<string> {
  const existing = await prisma.menu.findMany({ select: { key: true } });
  return withSuffix(base || 'menu', new Set(existing.map((menu) => menu.key)));
}

/** Address a menu item should use when it points at a material. */
async function materialUrl(groupId: string): Promise<string | null> {
  const group = await prisma.contentGroup.findFirst({
    where: { id: groupId, deletedAt: null },
    include: { items: { select: { lang: true, slug: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!group || !group.items.length) return null;
  const preferred =
    group.items.find((item) => item.lang === 'ru') ??
    group.items.find((item) => item.lang === 'uz') ??
    group.items[0];
  const override = group.type === 'page' ? await pagePathOverride(group.id) : null;
  return publicPath({ typeKey: group.type, slug: preferred.slug, pathOverride: override });
}

async function pagePathOverride(groupId: string): Promise<string | null> {
  const page = await prisma.page.findUnique({ where: { groupId }, select: { pathOverride: true } });
  return page?.pathOverride ?? null;
}

async function siteLanguages(): Promise<string[]> {
  const languages = await prisma.language.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true },
  });
  return languages.map((language) => language.code);
}

/** Depth of an item in its own menu, counted by walking up the parent chain. */
async function depthOf(itemId: string): Promise<number> {
  let depth = 0;
  let current = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { parentId: true } });
  while (current?.parentId && depth <= MENU_MAX_DEPTH) {
    depth += 1;
    current = await prisma.menuItem.findUnique({ where: { id: current.parentId }, select: { parentId: true } });
  }
  return depth;
}

/** Rewrites positions of one level so they stay 0, 1, 2… after a move or a deletion. */
async function renumberSiblings(menuId: string, parentId: string | null): Promise<void> {
  const siblings = await prisma.menuItem.findMany({
    where: { menuId, parentId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    siblings.map((sibling, index) => prisma.menuItem.update({ where: { id: sibling.id }, data: { sortOrder: index } })),
  );
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: Parameters<typeof translate>[1]) => translate(locale, key);
}

export async function createMenu(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const name = text(form, 'name', 80);
  const location = LOCATIONS.includes(form.get('location') as (typeof LOCATIONS)[number])
    ? (form.get('location') as string)
    : 'other';
  if (!name) backTo(form, '/admin/menus', 'notice=invalid');

  const menu = await prisma.menu.create({
    data: { key: await uniqueMenuKey(slugify(name, { maxLength: 40 })), name, location, isActive: true },
  });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.create',
    entityType: 'Menu',
    entityId: menu.id,
    description: `${t('audit.menuCreated')} «${menu.name}»`,
  });

  revalidatePath('/', 'layout');
  redirect(`/admin/menus/${menu.id}?notice=created`);
}

export async function updateMenu(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, `/admin/menus/${id}`, 'notice=denied');

  const menu = await prisma.menu.findUnique({ where: { id } });
  if (!menu) backTo(form, '/admin/menus', 'notice=missing');

  const name = text(form, 'name', 80);
  const location = LOCATIONS.includes(form.get('location') as (typeof LOCATIONS)[number])
    ? (form.get('location') as string)
    : menu.location;
  if (!name) backTo(form, `/admin/menus/${id}`, 'notice=invalid');

  const isActive = flag(form, 'isActive');
  await prisma.menu.update({ where: { id: menu.id }, data: { name, location, isActive } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.update',
    entityType: 'Menu',
    entityId: menu.id,
    description: `${t('audit.menu')} «${name}» · ${t(isActive ? 'menu.active' : 'menu.notShown')}`,
    payload: { location, isActive },
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${menu.id}`, 'notice=menu-saved');
}

export async function deleteMenu(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const menu = await prisma.menu.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!menu) backTo(form, '/admin/menus', 'notice=missing');

  await prisma.menu.delete({ where: { id: menu.id } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.delete',
    entityType: 'Menu',
    entityId: menu.id,
    description: `${t('audit.menuDeleted')} «${menu.name}»`,
  });

  revalidatePath('/', 'layout');
  backTo(form, '/admin/menus', 'notice=menu-deleted');
}

/** Creates a new item or saves an existing one; `item` empty means "create". */
export async function saveMenuItem(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const menuId = text(form, 'id', 40);
  const itemId = text(form, 'item', 40);
  const screen = itemId ? `/admin/menus/${menuId}/item/${itemId}` : `/admin/menus/${menuId}/item/new`;
  if (!guard.ok) backTo(form, screen, 'notice=denied');

  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) backTo(form, '/admin/menus', 'notice=missing');

  const languages = await siteLanguages();
  // A rejected save returns to this same form with what was typed, so one bad address
  // costs one field instead of the whole item.
  const reject: (notice: string) => never = (notice) =>
    redirect(`${screen}?${notice}&${draftQuery(form, languages)}`);

  const titles = new Map<string, string>();
  for (const code of languages) {
    const value = text(form, `title:${code}`, 200);
    if (value) titles.set(code, value);
  }
  if (!titles.size) reject('notice=no-title');

  const existing = itemId
    ? await prisma.menuItem.findFirst({ where: { id: itemId, menuId: menu.id } })
    : null;
  if (itemId && !existing) backTo(form, `/admin/menus/${menu.id}`, 'notice=missing');

  const requestedType = text(form, 'targetType', 20);
  const targetType: MenuTargetType = isMenuTargetType(requestedType) ? requestedType : 'page';

  const groupId = text(form, 'contentGroupId', 40);
  let contentGroupId: string | null = existing?.contentGroupId ?? null;
  let targetUrl: string | null = existing?.targetUrl ?? null;

  if (targetType === 'content') {
    const candidate = groupId || contentGroupId || '';
    const url = candidate ? await materialUrl(candidate) : null;
    if (!url) reject('notice=no-material');
    contentGroupId = candidate;
    targetUrl = url;
  } else {
    const normalized = normalizeMenuTarget(targetType, text(form, 'targetUrl', 500));
    if (normalized.invalid) reject('notice=bad-url');
    contentGroupId = null;
    targetUrl = normalized.url;
  }

  // A parent must live in this menu, must not be the item itself or one of its own sub-items,
  // and must leave room for one more level underneath.
  const requestedParent = text(form, 'parent', 40) || null;
  let parentId: string | null = existing?.parentId ?? null;
  if (requestedParent) {
    const parent = await prisma.menuItem.findFirst({
      where: { id: requestedParent, menuId: menu.id },
      select: { id: true },
    });
    if (!parent) reject('notice=missing');
    if (existing && (parent.id === existing.id || (await isDescendant(existing.id, parent.id)))) {
      reject('notice=bad-parent');
    }
    if ((await depthOf(parent.id)) >= MENU_MAX_DEPTH) reject('notice=too-deep');
    parentId = parent.id;
  } else if (existing) {
    parentId = null;
  }

  const isVisible = flag(form, 'isVisible');
  const openInNewTab = flag(form, 'openInNewTab');
  const isMegaMenu = flag(form, 'isMegaMenu') && !parentId;

  const data = {
    menuId: menu.id,
    parentId,
    targetType,
    targetUrl,
    contentGroupId,
    isVisible,
    openInNewTab,
    // A wide panel only makes sense for a top-level item with sub-items of its own.
    isMegaMenu,
    megaConfig: isMegaMenu ? existing?.megaConfig ?? null : null,
  };

  const saved = await prisma.$transaction(async (tx) => {
    const item = existing
      ? await tx.menuItem.update({ where: { id: existing.id }, data })
      : await tx.menuItem.create({
          data: {
            ...data,
            sortOrder: await nextSortOrder(tx, menu.id, parentId),
          },
        });

    const current = await tx.menuItemTranslation.findMany({ where: { itemId: item.id }, select: { lang: true } });
    for (const row of current) {
      const title = titles.get(row.lang);
      if (title === undefined) await tx.menuItemTranslation.delete({ where: { itemId_lang: { itemId: item.id, lang: row.lang } } });
    }
    for (const [lang, title] of titles) {
      await tx.menuItemTranslation.upsert({
        where: { itemId_lang: { itemId: item.id, lang } },
        update: { title },
        create: { itemId: item.id, lang, title },
      });
    }
    return item;
  });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: existing ? 'menu.item.update' : 'menu.item.create',
    entityType: 'MenuItem',
    entityId: saved.id,
    description: `${t(existing ? 'audit.menuItem' : 'audit.menuItemCreated')} «${titles.get('ru') ?? [...titles.values()][0]}» → ${targetUrl ?? '—'}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${menu.id}`, `notice=${existing ? 'item-saved' : 'item-created'}`);
}

async function nextSortOrder(
  client: Prisma.TransactionClient,
  menuId: string,
  parentId: string | null,
): Promise<number> {
  const last = await client.menuItem.findFirst({
    where: { menuId, parentId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

async function siblingCount(menuId: string, parentId: string | null): Promise<number> {
  return prisma.menuItem.count({ where: { menuId, parentId } });
}

/** True when `candidateId` sits somewhere below `itemId`. */
async function isDescendant(itemId: string, candidateId: string): Promise<boolean> {
  const children = await prisma.menuItem.findMany({ where: { parentId: itemId }, select: { id: true } });
  for (const child of children) {
    if (child.id === candidateId) return true;
    if (await isDescendant(child.id, candidateId)) return true;
  }
  return false;
}

export async function deleteMenuItem(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const itemId = text(form, 'item', 40);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { id: true, menuId: true, parentId: true, translations: { select: { title: true, lang: true } } },
  });
  if (!item) backTo(form, '/admin/menus', 'notice=missing');

  const title = item.translations.find((row) => row.lang === 'ru')?.title ?? item.translations[0]?.title ?? '';
  // Sub-items and translations follow the item: both relations cascade in the schema.
  await prisma.menuItem.delete({ where: { id: item.id } });
  await renumberSiblings(item.menuId, item.parentId);

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.item.delete',
    entityType: 'MenuItem',
    entityId: item.id,
    description: `${t('audit.menuItemDeleted')} «${title}»`,
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${item.menuId}`, 'notice=item-deleted');
}

export async function toggleMenuItem(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const itemId = text(form, 'item', 40);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { id: true, menuId: true, isVisible: true } });
  if (!item) backTo(form, '/admin/menus', 'notice=missing');

  await prisma.menuItem.update({ where: { id: item.id }, data: { isVisible: !item.isVisible } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.item.update',
    entityType: 'MenuItem',
    entityId: item.id,
    description: `${t('audit.menuItem')} · ${t(item.isVisible ? 'audit.menuItemHidden' : 'audit.menuItemShown')}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${item.menuId}`, 'notice=item-saved');
}

/**
 * The no-mouse counterpart of drag-and-drop: one step up, down, in or out.
 * Positions are renumbered afterwards so the list never depends on stale numbers.
 */
export async function moveMenuItem(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const itemId = text(form, 'item', 40);
  const direction = text(form, 'direction', 10);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
  if (!item || !['up', 'down', 'indent', 'outdent'].includes(direction)) {
    backTo(form, '/admin/menus', 'notice=missing');
  }

  const siblings = await prisma.menuItem.findMany({
    where: { menuId: item.menuId, parentId: item.parentId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  const index = siblings.findIndex((row) => row.id === item.id);

  if (direction === 'up' || direction === 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= siblings.length) backTo(form, `/admin/menus/${item.menuId}`, 'notice=order');
    const order = siblings.map((row) => row.id);
    [order[index], order[target]] = [order[target], order[index]];
    await prisma.$transaction(
      order.map((id, position) => prisma.menuItem.update({ where: { id }, data: { sortOrder: position } })),
    );
  } else if (direction === 'indent') {
    // Becomes the last sub-item of the row above it, which has to have room for one more level.
    if (index <= 0) backTo(form, `/admin/menus/${item.menuId}`, 'notice=order');
    const newParent = siblings[index - 1].id;
    if ((await depthOf(newParent)) >= MENU_MAX_DEPTH) backTo(form, `/admin/menus/${item.menuId}`, 'notice=too-deep');
    await prisma.menuItem.update({
      where: { id: item.id },
      // Positions are kept dense, so the count is exactly where the new last sub-item goes.
      data: { parentId: newParent, sortOrder: await siblingCount(item.menuId, newParent), isMegaMenu: false },
    });
    await renumberSiblings(item.menuId, item.parentId);
  } else {
    const parent = item.parentId
      ? await prisma.menuItem.findUnique({ where: { id: item.parentId }, select: { id: true, parentId: true, sortOrder: true } })
      : null;
    if (!parent) backTo(form, `/admin/menus/${item.menuId}`, 'notice=order');
    await prisma.menuItem.update({
      where: { id: item.id },
      data: { parentId: parent.parentId, sortOrder: parent.sortOrder + 1 },
    });
    await renumberSiblings(item.menuId, parent.parentId);
    await renumberSiblings(item.menuId, parent.id);
  }

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${item.menuId}`, 'notice=order');
}

export async function saveMenuOrder(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const menuId = text(form, 'id', 40);
  if (!guard.ok) backTo(form, `/admin/menus/${menuId}`, 'notice=denied');

  const menu = await prisma.menu.findUnique({ where: { id: menuId }, select: { id: true, name: true } });
  if (!menu) backTo(form, '/admin/menus', 'notice=missing');

  const known = await prisma.menuItem.findMany({ where: { menuId: menu.id }, select: { id: true } });
  const entries = parseOrderPayload(
    form.get('order'),
    new Set(known.map((row) => row.id)),
    MENU_MAX_DEPTH,
  );
  if (!entries) backTo(form, `/admin/menus/${menu.id}`, 'notice=order-invalid');

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.menuItem.update({
        where: { id: entry.id },
        data: { parentId: entry.parentId, sortOrder: entry.sortOrder },
      }),
    ),
  );

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.reorder',
    entityType: 'Menu',
    entityId: menu.id,
    description: `${t('audit.menuOrder')} · «${menu.name}»`,
    payload: { items: entries.length },
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${menu.id}`, 'notice=order');
}

/** The material picker writes the link straight onto a saved item. */
export async function linkMenuMaterial(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const itemId = text(form, 'item', 40);
  const groupId = text(form, 'group', 40);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { id: true, menuId: true } });
  if (!item) backTo(form, '/admin/menus', 'notice=missing');

  const url = await materialUrl(groupId);
  if (!url) backTo(form, `/admin/menus/${item.menuId}/pick?item=${item.id}`, 'notice=no-material');

  const group = await prisma.contentGroup.findUnique({
    where: { id: groupId },
    include: { items: { select: { title: true, lang: true }, orderBy: { createdAt: 'asc' } } },
  });
  await prisma.menuItem.update({
    where: { id: item.id },
    data: { targetType: 'content', contentGroupId: groupId, targetUrl: url },
  });

  const title = group?.items.find((row) => row.lang === 'ru')?.title ?? group?.items[0]?.title ?? '';
  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.item.update',
    entityType: 'MenuItem',
    entityId: item.id,
    description: `${t('audit.menuItemLinked')} · «${title}» → ${url}`,
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${item.menuId}/item/${item.id}`, 'notice=material-linked');
}

export async function unlinkMenuMaterial(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const itemId = text(form, 'item', 40);
  if (!guard.ok) backTo(form, '/admin/menus', 'notice=denied');

  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { id: true, menuId: true, targetUrl: true },
  });
  if (!item) backTo(form, '/admin/menus', 'notice=missing');

  await prisma.menuItem.update({
    where: { id: item.id },
    data: { contentGroupId: null, targetType: 'page', targetUrl: item.targetUrl },
  });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'menu.item.update',
    entityType: 'MenuItem',
    entityId: item.id,
    description: t('audit.menuItemUnlinked'),
  });

  revalidatePath('/', 'layout');
  backTo(form, `/admin/menus/${item.menuId}/item/${item.id}`, 'notice=material-unlinked');
}
