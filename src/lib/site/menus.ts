/**
 * The navigation a visitor sees, built from what the Menu Manager stored.
 *
 * A menu item can point at a page path, a material, an external site or an anchor on the current
 * page; each of those becomes a usable address here, in the language of the page being rendered.
 * An item whose material is not published in any readable language is dropped rather than shown
 * as a link to a 404 — a content manager must not have to remember to hide it.
 */
import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import { localizedPath } from '@/lib/content/routes';
import { externalHref, internalHref } from '@/lib/site/link';
import { CONTENT_STATUS } from '@/lib/enums';

export interface PublicNavItem {
  id: string;
  title: string;
  href: string;
  openInNewTab: boolean;
  children: PublicNavItem[];
}

type Row = {
  id: string;
  parentId: string | null;
  targetType: string;
  targetUrl: string | null;
  openInNewTab: boolean;
  sortOrder: number;
  translations: { lang: string; title: string }[];
  contentGroupId: string | null;
  contentGroup: {
    type: string;
    sourceLang: string;
    pagePath: string | null;
    items: { lang: string; slug: string }[];
  } | null;
};

/** The language a visitor is reading, used to pick a translation and a material version. */
function titleFor(row: Row, lang: string): string {
  const byLang = new Map(row.translations.map((translation) => [translation.lang, translation.title.trim()]));
  const preferred = [lang, 'ru', 'uz', 'en'];
  for (const code of preferred) {
    const value = byLang.get(code);
    if (value) return value;
  }
  return row.translations.find((translation) => translation.title.trim())?.title.trim() ?? '';
}

/**
 * The address an item leads to. Published versions only, and the language prefix always matches
 * the version that is actually linked, because a slug belongs to one language.
 */
function hrefFor(row: Row, lang: string): string | null {
  if (row.targetType === 'external') {
    return row.targetUrl ? externalHref(row.targetUrl) : null;
  }
  if (row.targetType === 'section') {
    const anchor = row.targetUrl ?? '';
    return anchor.startsWith('#') && anchor.length > 1 ? anchor : null;
  }
  if (row.targetType === 'content') {
    const group = row.contentGroup;
    if (!group) return null;
    const version =
      group.items.find((item) => item.lang === lang) ??
      group.items.find((item) => item.lang === group.sourceLang) ??
      group.items[0];
    if (!version) return null;
    return localizedPath({ typeKey: group.type, slug: version.slug, pathOverride: group.pagePath }, version.lang);
  }
  return internalHref((row.targetUrl ?? '').trim(), lang);
}

function tree(rows: Row[], lang: string, parentId: string | null = null): PublicNavItem[] {
  const nodes: PublicNavItem[] = [];
  for (const row of rows) {
    if (row.parentId !== parentId) continue;
    const title = titleFor(row, lang);
    const href = hrefFor(row, lang);
    if (!title || !href) continue;
    nodes.push({
      id: row.id,
      title,
      href,
      openInNewTab: row.openInNewTab,
      children: tree(rows, lang, row.id),
    });
  }
  return nodes;
}

export const publicMenu = cache(async (menuKey: string, lang: string): Promise<PublicNavItem[]> => {
  const menu = await prisma.menu.findFirst({
    where: { key: menuKey, isActive: true },
    select: {
      items: {
        where: { isVisible: true },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          parentId: true,
          targetType: true,
          targetUrl: true,
          openInNewTab: true,
          sortOrder: true,
          translations: { select: { lang: true, title: true } },
          contentGroupId: true,
          contentGroup: {
            where: { deletedAt: null },
            select: {
              type: true,
              sourceLang: true,
              page: { select: { pathOverride: true } },
              items: {
                where: { status: CONTENT_STATUS.PUBLISHED, deletedAt: null },
                select: { lang: true, slug: true },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      },
    },
  });
  if (!menu) return [];

  const rows: Row[] = menu.items.map((item) => ({
    ...item,
    contentGroup: item.contentGroup
      ? {
          type: item.contentGroup.type,
          sourceLang: item.contentGroup.sourceLang,
          pagePath: item.contentGroup.page?.pathOverride ?? null,
          items: item.contentGroup.items,
        }
      : null,
  }));

  // A child is only reachable through its parent, so a dropped parent must not orphan its branch.
  return tree(rows, lang);
});
