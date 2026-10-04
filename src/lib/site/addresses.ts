/**
 * Every address the public site answers.
 *
 * The sitemap is written from the same tables the pages are drawn from — the routing table for the
 * sections, `ContentItem` for the materials — so nothing has to be remembered to be listed, and a
 * page that is hidden from search engines, in a language the site no longer speaks, or unpublished
 * is not offered to a crawler either.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { CONTENT_STATUS } from '@/lib/enums';
import { publicPath } from '@/lib/content/routes';
import { siteLanguages } from '@/lib/site/languages';
import { listingRoutes } from '@/lib/site/routing';
import { seoCandidates } from '@/lib/site/seo';

export interface SiteAddress {
  /** Absolute, language prefix included, without the site's own address. */
  path: string;
  lang: string;
  /** Ticked by the author of a material; an address hidden on the SEO screen is dropped as well. */
  noIndex?: boolean;
  updatedAt: Date | null;
  /** What a crawler is told about the page, not what the site thinks of its own importance. */
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly';
}

/** Sections change whenever their newest material does; a staff page rarely changes at all. */
const FAST_TYPES = new Set(['news', 'announcement', 'event']);

export async function siteAddresses(): Promise<SiteAddress[]> {
  const [languages, items, hidden] = await Promise.all([
    siteLanguages(),
    prisma.contentItem.findMany({
      where: { status: CONTENT_STATUS.PUBLISHED, deletedAt: null, group: { deletedAt: null } },
      select: {
        lang: true,
        slug: true,
        updatedAt: true,
        noIndex: true,
        group: { select: { type: true, page: { select: { pathOverride: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.routeSeo.findMany({ where: { noIndex: true }, select: { lang: true, routePath: true } }),
  ]);

  const codes = new Set(languages.map((language) => language.code));
  const hiddenRows = new Set(hidden.map((row) => `${row.lang}\u0000${row.routePath}`));
  const sections = new Set<string>();

  const out: SiteAddress[] = [];
  const seen = new Set<string>();
  function add(address: SiteAddress) {
    // An address the SEO screen hides from search engines is not offered to a crawler, and the same
    // address never appears twice, whatever a page's own path collides with.
    if (seen.has(address.path)) return;
    if (address.noIndex || seoCandidates(address.lang, address.path).some((candidate) => hiddenRows.has(`${address.lang}\u0000${candidate}`))) return;
    seen.add(address.path);
    out.push(address);
  }

  for (const language of languages) {
    const code = language.code;
    add({ path: `/${code}`, lang: code, updatedAt: null, priority: 1, changefreq: 'daily' });
    add({ path: `/${code}/contact`, lang: code, updatedAt: null, priority: 0.5, changefreq: 'monthly' });
    for (const spec of listingRoutes()) {
      const path = `/${code}/${spec.path}`;
      sections.add(path);
      add({ path, lang: code, updatedAt: null, priority: 0.7, changefreq: 'daily' });
    }
  }

  for (const item of items) {
    // A language switched off in the panel has no address to advertise.
    if (!codes.has(item.lang)) continue;
    const path = `/${item.lang}${publicPath({
      typeKey: item.group.type,
      slug: item.slug,
      pathOverride: item.group.page?.pathOverride ?? null,
    })}`;
    if (sections.has(path)) continue;

    const fast = FAST_TYPES.has(item.group.type);
    add({
      path,
      lang: item.lang,
      noIndex: item.noIndex,
      updatedAt: item.updatedAt,
      priority: item.group.type === 'page' ? 0.7 : fast ? 0.8 : 0.6,
      changefreq: fast ? 'daily' : 'weekly',
    });
  }

  return out;
}
