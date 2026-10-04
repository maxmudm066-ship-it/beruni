import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { locale } from 'next/root-params';
import { currentLanguage } from '@/lib/site/request';
import { resolveRoute, listingAtExact, type ListingSpec } from '@/lib/site/routing';
import {
  buildListing,
  materialAt,
  materialPublishedElsewhere,
  materialThroughOtherLanguage,
  pageAt,
  pagePublishedElsewhere,
  pageThroughOtherLanguage,
  type Listing,
  type ListingParams,
  type PublicPage,
} from '@/lib/site/content';
import { resolveSiteLanguage } from '@/lib/site/languages';
import { applyStoredRedirect } from '@/lib/site/redirects';
import { pageMetadata } from '@/lib/site/seo';
import { sectionName, siteLabeler } from '@/lib/site/dictionary';
import { ListingView } from '@/components/site/listing-view';
import { MaterialDetail } from '@/components/site/material-detail';
import { ContactView } from '@/components/site/contact-view';
import type { Crumb } from '@/components/site/breadcrumbs';

/**
 * Every page of the site below the home page.
 *
 * One route serves all of them because the address, not a folder, decides what the page is: see
 * ../../../../lib/site/routing. A listing, a material inside a listing, a page at an address its
 * author chose, or the contacts — and anything else is a 404, which the site says with a status
 * code rather than by showing the home page.
 */

type View =
  | { kind: 'listing'; listing: Listing; spec: ListingSpec }
  | { kind: 'material'; page: PublicPage; spec: ListingSpec | null }
  | { kind: 'contact' }
  /** The address belongs to this site but not to this language, so it leads somewhere else on it. */
  | { kind: 'redirect'; href: string }
  | { kind: 'missing' };

function readParams(search: string): ListingParams {
  const query = new URLSearchParams(search);
  return {
    category: query.get('category'),
    kind: query.get('kind'),
    tag: query.get('tag'),
    q: query.get('q'),
    page: query.get('page'),
  };
}

/**
 * The page behind one address, looked up once per request.
 *
 * `generateMetadata` and the page both need it, and the keys are plain strings so React can tell the
 * two calls are the same page — otherwise a visitor would pay for the database twice.
 */
const viewAt = cache(async (slugKey: string, lang: string, search: string): Promise<View> => {
  const segments = slugKey ? slugKey.split('/') : [];
  const params = readParams(search);
  const route = resolveRoute(segments);

  if (route.kind === 'contact') {
    // A written «Contacts» page wins over the built-in one: staff may replace it without code.
    const written = await pageAt('contact', lang);
    return written ? { kind: 'material', page: written, spec: null } : { kind: 'contact' };
  }

  if (route.kind === 'listing') {
    return { kind: 'listing', listing: await buildListing(route.spec, lang, params), spec: route.spec };
  }

  if (route.kind === 'material') {
    const page = await materialAt(route.spec, route.slug, lang);
    if (page) return { kind: 'material', page, spec: route.spec };

    // The language switch keeps the address and replaces only its prefix, while every language names
    // its own version of a material. Follow such an address back to the page the visitor meant.
    const through = await materialThroughOtherLanguage(route.spec, route.slug, lang);
    if (through) return { kind: 'redirect', href: through.href };

    // The material is real but has no version in this language: its section does.
    if (await materialPublishedElsewhere(route.spec.typeKey, route.slug, lang)) {
      return { kind: 'redirect', href: `/${lang}/${route.spec.path}` };
    }
    return { kind: 'missing' };
  }

  const page = await pageAt(route.path, lang);
  if (page) return { kind: 'material', page, spec: null };
  if (route.path) {
    const through = await pageThroughOtherLanguage(route.path, lang);
    if (through) return { kind: 'redirect', href: through.href };
    if (await pagePublishedElsewhere(route.path, lang)) return { kind: 'redirect', href: `/${lang}` };
  }
  return { kind: 'missing' };
});

interface Props {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The query string, with repeated parameters dropped: a visitor cannot send two `?page=` values. */
function searchKey(search: Record<string, string | string[] | undefined>): string {
  const entries = Object.entries(search).flatMap(([key, value]) => (typeof value === 'string' ? [[key, value] as [string, string]] : []));
  return new URLSearchParams(entries).toString();
}

function crumbsFor(lang: string, view: View): Crumb[] {
  const t = siteLabeler(lang);
  const rows: Crumb[] = [{ title: t('site.home'), href: `/${lang}` }];

  if (view.kind === 'listing') {
    const segments = view.spec.segments;
    segments.slice(0, -1).forEach((_, index) => {
      const parent = listingAtExact(segments.slice(0, index + 1));
      if (parent) rows.push({ title: sectionName(lang, parent.title, parent.typeKey), href: `/${lang}/${parent.path}` });
    });
    rows.push({ title: view.listing.heading });
    return rows;
  }

  if (view.kind === 'material') {
    if (view.spec) {
      const segments = view.spec.segments;
      segments.slice(0, -1).forEach((_, index) => {
        const parent = listingAtExact(segments.slice(0, index + 1));
        if (parent) rows.push({ title: sectionName(lang, parent.title, parent.typeKey), href: `/${lang}/${parent.path}` });
      });
      rows.push({ title: sectionName(lang, view.spec.title, view.spec.typeKey), href: view.page.listHref });
    }
    rows.push({ title: view.page.title });
    return rows;
  }

  rows.push({ title: t('footer.contacts') });
  return rows;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug = [] } = await params;
  const search = await searchParams;
  const prefix = await locale();
  const language = await resolveSiteLanguage(prefix);
  if (!language) return {};

  const lang = language.code;
  const path = `/${[lang, ...slug].filter(Boolean).join('/')}`;
  const view = await viewAt(slug.join('/'), lang, searchKey(search));
  const t = siteLabeler(lang);

  if (view.kind === 'material') {
    const page = view.page;
    const alternates: Record<string, string> = {};
    for (const other of page.others) alternates[other.lang] = other.href;
    return pageMetadata({
      lang,
      path,
      canonical: page.seo.canonical || page.href,
      title: page.seo.title || page.title,
      description: page.seo.description || page.excerpt,
      keywords: page.seo.keywords,
      alternates,
      image: page.seo.ogImage || page.hero?.url,
      ogTitle: page.seo.ogTitle,
      ogDescription: page.seo.ogDescription,
      openGraphType: 'article',
      noIndex: page.seo.noIndex,
    });
  }

  if (view.kind === 'listing') {
    // A section lives at the same address in every language, so no alternates are spelled out here.
    return pageMetadata({ lang, path, title: view.listing.heading, canonical: view.listing.baseHref });
  }

  if (view.kind === 'contact') {
    return pageMetadata({ lang, path, title: t('footer.contacts') });
  }

  if (view.kind === 'redirect') return {};

  return { title: t('notFound.title'), robots: { index: false, follow: false } };
}

export default async function PublicPageRoute({ params, searchParams }: Props) {
  const { slug = [] } = await params;
  const search = await searchParams;

  // An address the site moved away from is answered before anything else, including before the
  // language of the page is settled: the visitor is after a text, not after a grammar.
  const prefix = await locale();
  const query = searchKey(search);
  await applyStoredRedirect(`/${[prefix, ...slug].filter(Boolean).join('/')}`, query ? `?${query}` : '');

  const language = await currentLanguage();
  const lang = language.code;

  const view = await viewAt(slug.join('/'), lang, searchKey(search));
  if (view.kind === 'redirect') redirect(view.href);
  if (view.kind === 'missing') notFound();

  const crumbs = crumbsFor(lang, view);

  if (view.kind === 'listing') return <ListingView listing={view.listing} lang={lang} crumbs={crumbs} />;
  if (view.kind === 'contact') {
    const path = `/${[lang, ...slug].filter(Boolean).join('/')}`;
    // The letter answers on the page it was written on: `?sent=` for a good one, `?bad=` for the
    // reason a refusal gave. Only the two known marks are read, and the form knows its own sentences.
    const notice = typeof search.sent === 'string' ? 'sent' : typeof search.bad === 'string' ? search.bad : '';
    return <ContactView lang={lang} crumbs={crumbs} back={path} notice={notice} />;
  }
  return <MaterialDetail page={view.page} lang={lang} crumbs={crumbs} />;
}
