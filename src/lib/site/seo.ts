/**
 * What a search engine is told about a page.
 *
 * Three things decide it. The material itself: its SEO fields, which a content manager fills in
 * beside the text. The address: the SEO-by-address screen can override the title, the description
 * and the index switch for any page of the site, including the ones no person wrote — a section
 * listing, the home page. And Settings: the site's own address, its ending title and the picture
 * shown when a link is posted somewhere social.
 *
 * An address wins over the material, because the person who typed it into that screen meant it.
 */
import 'server-only';
import { cache } from 'react';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { getSiteSetting } from '@/lib/settings';
import { loadBranding } from '@/lib/site/branding';
import { defaultSiteLanguage, siteLanguages } from '@/lib/site/languages';

/**
 * The address the site is known by, without a trailing slash.
 *
 * Settings win, because that is what the panel writes and what a content manager can change without
 * a redeploy. The environment variable is the fallback for a deployment that has not been configured
 * through the screen yet, and an empty answer means nobody has said where this site lives — which a
 * search engine would have to guess, so the pages that need an absolute address say nothing instead.
 */
export const siteOrigin = cache(async (): Promise<string> => {
  const configured = (await getSiteSetting('seo', 'site_url')).trim() || (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  return configured.replace(/\/+$/, '');
});

/** An address of this page made absolute, so a crawler can use it. */
export function absoluteUrl(path: string, origin: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!origin) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

interface SeoOverride {
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  noIndex: boolean;
}

const EMPTY: SeoOverride = {
  title: '',
  description: '',
  keywords: '',
  canonical: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  noIndex: false,
};

function normalised(path: string): string {
  const value = path.trim();
  if (!value || value === '/') return '/';
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value.startsWith('/') ? value : `/${value}`;
}

const LANGUAGE_PREFIX = /^\/[a-z0-9-]{2,12}(?=\/|$)/i;

/**
 * Both spellings an address is kept under on the SEO-by-address screen.
 *
 * A person writing `/news` and a person writing `/ru/news` mean the same page, so the stored rows are
 * looked for under both, and whatever hides one of them hides the page.
 */
export function seoCandidates(lang: string, path: string): string[] {
  const wanted = normalised(path);
  const bare = wanted.replace(LANGUAGE_PREFIX, '') || '/';
  return [...new Set([wanted, bare, bare === '/' ? `/${lang}` : `/${lang}${bare}`])];
}

/**
 * The address stored for one language. A person writing `/news` and a person writing `/ru/news` mean
 * the same page, so both spellings are looked for.
 */
export const seoOverride = cache(async (lang: string, path: string): Promise<SeoOverride> => {
  for (const candidate of seoCandidates(lang, path)) {
    const row = await prisma.routeSeo.findUnique({ where: { lang_routePath: { lang, routePath: candidate } } });
    if (!row) continue;
    return {
      title: row.title?.trim() ?? '',
      description: row.description?.trim() ?? '',
      keywords: row.keywords?.trim() ?? '',
      canonical: row.canonicalUrl?.trim() ?? '',
      ogTitle: row.ogTitle?.trim() ?? '',
      ogDescription: row.ogDescription?.trim() ?? '',
      ogImage: row.ogImageAssetId?.trim() ?? '',
      noIndex: row.noIndex,
    };
  }
  return EMPTY;
});

export interface PageSeo {
  /** The language of the page being drawn. */
  lang: string;
  /** Its address, with the language prefix the visitor used. */
  path: string;
  title: string;
  description?: string;
  keywords?: string;
  /** Where the same page exists in another language, as addresses of this site. */
  alternates?: Record<string, string>;
  /** The picture shown when the link is posted; the site's own picture is used when there is none. */
  image?: string | null;
  /** Wording for the posted link, when the material has its own instead of the page title. */
  ogTitle?: string;
  ogDescription?: string;
  openGraphType?: 'website' | 'article';
  /** The address that is this page's own, when the visitor reached it through another one. */
  canonical?: string;
  /** What the author of the material itself ticked, so a page that should not be listed is not. */
  noIndex?: boolean;
  /** A page that is the site itself: its title is not written with the Settings ending. */
  absoluteTitle?: boolean;
}

/**
 * The `<head>` of one page.
 *
 * `hreflang` entries are written out in full, including `x-default`, because a visitor who arrived
 * with no language preference at all is sent to the language the panel set as its own default.
 */
export async function pageMetadata(input: PageSeo): Promise<Metadata> {
  const [override, branding, origin, languages, fallback] = await Promise.all([
    seoOverride(input.lang, input.path),
    loadBranding(input.lang),
    siteOrigin(),
    siteLanguages(),
    defaultSiteLanguage(),
  ]);

  const path = normalised(input.path);
  const canonical = override.canonical || absoluteUrl(input.canonical ?? path, origin);

  const hreflangs: Record<string, string> = {};
  for (const language of languages) {
    const at = input.alternates?.[language.code] ?? languageOf(path, language.code);
    if (at) hreflangs[language.code] = absoluteUrl(at, origin);
  }
  if (hreflangs[fallback]) hreflangs['x-default'] = hreflangs[fallback];

  const image = override.ogImage ? await mediaUrl(override.ogImage) : null;
  const picture = image ?? input.image ?? branding.ogImage;
  const title = override.title || input.title;
  const hide = override.noIndex || Boolean(input.noIndex);

  return {
    // The home page is the site's own name, so it is not written twice with the Settings ending.
    title: input.absoluteTitle ? { absolute: title } : title,
    description: override.description || input.description || undefined,
    keywords: override.keywords || input.keywords || undefined,
    alternates: { canonical, languages: hreflangs },
    robots: hide ? { index: false, follow: false } : undefined,
    openGraph: {
      type: input.openGraphType ?? 'website',
      url: canonical,
      siteName: branding.siteName || branding.shortName,
      locale: input.lang,
      title: override.ogTitle || input.ogTitle || override.title || input.title,
      description: override.ogDescription || input.ogDescription || override.description || input.description || undefined,
      images: picture ? [{ url: absoluteUrl(picture, origin) }] : undefined,
    },
  };
}

/** The same address with another language prefix, used when nobody said otherwise. */
function languageOf(path: string, code: string): string {
  const without = path.replace(LANGUAGE_PREFIX, '') || '/';
  return normalised(without === '/' ? `/${code}` : `/${code}${without}`);
}

/** The file a Media Library id on the SEO screen points at. */
async function mediaUrl(mediaId: string): Promise<string | null> {
  if (!mediaId) return null;
  const media = await prisma.media.findFirst({
    where: { id: mediaId, kind: 'image' },
    select: { publicUrl: true, variants: { where: { role: 'large' }, select: { publicUrl: true } } },
  });
  return media?.variants[0]?.publicUrl ?? media?.publicUrl ?? null;
}
