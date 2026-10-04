import Link from 'next/link';
import { siteLabeler } from '@/lib/site/dictionary';
import { sectionHref, type Listing } from '@/lib/site/content';
import { MaterialCard } from '@/components/site/material-card';
import { Breadcrumbs, type Crumb } from '@/components/site/breadcrumbs';
import { KICKER, PAGE_HEADING, RULE } from '@/components/site/styles';

const CHIP = 'inline-flex items-center border border-border px-3.5 py-1.5 text-sm text-ink-deep transition-colors hover:border-ink hover:bg-parchment';
const CHIP_ACTIVE = 'inline-flex items-center border border-ink bg-ink px-3.5 py-1.5 text-sm font-medium text-white';
const PAGE_LINK = 'inline-flex h-9 min-w-9 items-center justify-center border border-border px-3 text-sm text-ink-deep transition-colors hover:border-ink hover:bg-parchment';
const PAGE_ACTIVE = 'inline-flex h-9 min-w-9 items-center justify-center border border-ink bg-ink px-3 text-sm font-medium text-white';

/** The page numbers to show: both ends, the current page and its neighbours. */
function pageWindow(current: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const keep = new Set([1, 2, pages - 1, pages, current - 1, current, current + 1]);
  const listed = [...keep].filter((page) => page >= 1 && page <= pages).sort((a, b) => a - b);
  if (listed.length < pages) return [...listed, -1];
  return listed;
}

function Chips({ label, allLabel, options, active, allHref }: { label: string; allLabel: string; options: Listing['categories']; active: string; allHref: string }) {
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={KICKER}>{label}</span>
      <Link href={allHref} className={active ? CHIP : CHIP_ACTIVE}>
        {allLabel}
      </Link>
      {options.map((option) => (
        <Link key={option.value} href={option.href} className={option.value === active ? CHIP_ACTIVE : CHIP}>
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function ListingView({ listing, lang, crumbs }: { listing: Listing; lang: string; crumbs: Crumb[] }) {
  const t = siteLabeler(lang);
  const filtered = Boolean(listing.activeCategory || listing.activeKind || listing.activeTag || listing.query);
  const pages = pageWindow(listing.page, listing.pages);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <Breadcrumbs rows={crumbs} />
      <div className="mt-6">
        <span aria-hidden className={RULE} />
        <h1 className={`mt-4 ${PAGE_HEADING}`}>{listing.heading}</h1>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-y border-border py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Chips label={t('list.categories')} allLabel={t('list.all')} options={listing.categories} active={listing.activeCategory} allHref={sectionHref(listing.baseHref, { kind: listing.activeKind, q: listing.query })} />
          <Chips label={t('list.kinds')} allLabel={t('list.all')} options={listing.kinds} active={listing.activeKind} allHref={sectionHref(listing.baseHref, { category: listing.activeCategory, q: listing.query })} />
        </div>
        <form action={listing.baseHref} method="get" className="flex items-center gap-2">
          {listing.activeCategory ? <input type="hidden" name="category" value={listing.activeCategory} /> : null}
          {listing.activeKind ? <input type="hidden" name="kind" value={listing.activeKind} /> : null}
          <label className="sr-only" htmlFor="site-search">
            {t('list.search')}
          </label>
          <input
            id="site-search"
            name="q"
            defaultValue={listing.query}
            placeholder={t('list.searchPlaceholder')}
            maxLength={120}
            className="h-9 w-56 border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-brass-deep focus:ring-1 focus:ring-brass-deep"
          />
          <button type="submit" className="inline-flex h-9 items-center border border-ink bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-ink-deep">
            {t('list.searchSubmit')}
          </button>
          {filtered ? (
            <Link href={listing.baseHref} className="text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-ink hover:decoration-brass">
              {t('list.reset')}
            </Link>
          ) : null}
        </form>
      </div>

      {filtered && listing.total ? (
        <p className="mt-5 text-sm text-muted-foreground">
          <span className={KICKER}>{t('list.found')}</span> <span className="ml-1 font-semibold text-ink-deep">{listing.total}</span>
        </p>
      ) : null}

      {listing.items.length ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listing.items.map((item) => (
            <MaterialCard key={item.itemId} item={item} lang={lang} readMoreLabel={t('common.readMore')} />
          ))}
        </div>
      ) : (
        <p className="mt-10 border border-dashed border-border bg-parchment/60 p-8 text-center text-muted-foreground">
          {filtered ? t('list.noneFound') : t('common.empty')}
        </p>
      )}

      {listing.pages > 1 ? (
        <nav aria-label={t('list.page')} className="mt-12 flex flex-wrap items-center gap-2 border-t border-border pt-6">
          {listing.page > 1 ? (
            <Link href={sectionHref(listing.baseHref, { category: listing.activeCategory, kind: listing.activeKind, tag: listing.activeTag, q: listing.query, page: listing.page - 1 })} className={PAGE_LINK}>
              {t('list.previous')}
            </Link>
          ) : null}
          {pages.map((page) =>
            page === -1 ? (
              <span key="gap" className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={page}
                href={sectionHref(listing.baseHref, { category: listing.activeCategory, kind: listing.activeKind, tag: listing.activeTag, q: listing.query, page })}
                className={page === listing.page ? PAGE_ACTIVE : PAGE_LINK}
                aria-current={page === listing.page ? 'page' : undefined}
              >
                {page}
              </Link>
            ),
          )}
          {listing.page < listing.pages ? (
            <Link href={sectionHref(listing.baseHref, { category: listing.activeCategory, kind: listing.activeKind, tag: listing.activeTag, q: listing.query, page: listing.page + 1 })} className={PAGE_LINK}>
              {t('list.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
