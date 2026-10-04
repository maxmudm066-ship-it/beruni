import Link from 'next/link';
import { formatDate, formatBytes } from '@/lib/admin/format';
import { siteLabeler } from '@/lib/site/dictionary';
import { sectionHref, type PublicPage } from '@/lib/site/content';
import { siteLanguages } from '@/lib/site/languages';
import { Breadcrumbs, type Crumb } from '@/components/site/breadcrumbs';
import { BODY_LINK, KICKER, PAGE_HEADING, RULE } from '@/components/site/styles';

const LINK_CLASS = BODY_LINK;
const CHIP_TAG = 'inline-flex items-center border border-border px-3 py-1 text-xs uppercase tracking-[0.08em] text-ink-deep transition-colors hover:border-ink hover:bg-parchment';

/** A part of an article: marked by the same brass rule the homepage bands open with, one size down. */
function PartHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden className={RULE} />
      <h2 className="mt-3 font-heading text-[22px] font-semibold tracking-tight text-ink-deep">{children}</h2>
    </>
  );
}

function Prose({ html }: { html: string }) {
  return (
    <div
      // Sanitised when it was read, in ../lib/content/html — the database is not trusted on its own.
      dangerouslySetInnerHTML={{ __html: html }}
      className="content-html mt-4"
    />
  );
}

export async function MaterialDetail({ page, lang, crumbs }: { page: PublicPage; lang: string; crumbs: Crumb[] }) {
  const t = siteLabeler(lang);
  const languages = await siteLanguages();
  const languageName = (code: string) => languages.find((language) => language.code === code)?.nativeName ?? code;
  const tagBase = page.listHref;
  const other = page.others.filter((entry) => entry.lang !== lang);

  return (
    <article className="mx-auto max-w-4xl px-4 py-14">
      <Breadcrumbs rows={crumbs} />

      <header className="mt-6">
        {page.category ? (
          <Link href={sectionHref(tagBase, { category: page.category.slug })} className={KICKER}>
            {page.category.name}
          </Link>
        ) : null}
        <h1 className={`mt-3 ${PAGE_HEADING}`}>{page.title}</h1>
        {page.subtitle ? <p className="mt-3 text-xl leading-relaxed text-muted-foreground">{page.subtitle}</p> : null}
        {page.publishedAt ? (
          <div className="mt-6 flex items-center gap-3">
            <span aria-hidden className="h-px w-8 bg-brass" />
            <time dateTime={page.publishedAt.toISOString()} className="text-sm text-muted-foreground">
              {formatDate(page.publishedAt, lang)}
            </time>
          </div>
        ) : null}
      </header>

      {page.hero ? (
        // eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired
        <img src={page.hero.url} alt={page.hero.alt} loading="lazy" className="mt-8 aspect-[16/9] w-full object-cover" />
      ) : null}

      {page.excerpt ? <p className="mt-8 border-l-2 border-brass pl-5 text-xl leading-relaxed text-foreground/90">{page.excerpt}</p> : null}
      {page.body ? <Prose html={page.body} /> : null}

      {page.facts.length ? (
        <dl className="mt-10 border-y-2 border-ink bg-parchment/60 text-sm">
          {page.facts.map((fact) => (
            <div key={fact.label} className="grid gap-1 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[200px_1fr] sm:gap-4">
              <dt className={KICKER}>{fact.label}</dt>
              <dd className={`text-[16px] leading-snug text-foreground ${fact.long ? 'whitespace-pre-line' : ''}`}>
                {fact.href ? (
                  <a href={fact.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {fact.value}
                  </a>
                ) : (
                  fact.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {page.people.map((group) => (
        <section key={group.label} className="mt-12">
          <PartHeading>{group.label}</PartHeading>
          <ul className="mt-5 grid gap-px bg-border text-sm sm:grid-cols-2">
            {group.rows.map((person, index) => (
              <li key={`${person.name}-${index}`} className="bg-background p-4">
                {person.href ? (
                  <Link href={person.href} className={`font-semibold ${LINK_CLASS}`}>
                    {person.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{person.name}</span>
                )}
                {person.note ? <span className="mt-1 block text-muted-foreground">{person.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {page.mediaGroups.map((group) => (
        <section key={group.label} className="mt-12">
          <PartHeading>{group.label}</PartHeading>
          {group.images.length ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {group.images.map((image, index) => (
                <figure key={index}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired */}
                  <img src={image.url} alt={image.alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  {image.caption ? <figcaption className="mt-2 border-l-2 border-brass pl-2.5 text-xs leading-snug text-muted-foreground">{image.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : null}
          {group.files.length ? (
            <ul className="mt-5 divide-y divide-border border-y border-border text-sm">
              {group.files.map((file) => (
                <li key={file.href + file.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="truncate font-medium">{file.name}</span>
                  <a href={file.href} download className={`shrink-0 text-sm ${LINK_CLASS}`}>
                    {t('detail.download')}
                    {file.size ? ` · ${formatBytes(file.size)}` : ''}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {group.links.length ? (
            <ul className="mt-5 space-y-2.5 text-sm">
              {group.links.map((row) => (
                <li key={row.href + row.title} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass" />
                  <a href={row.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                    {row.title || t('detail.watch')}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {page.sections.map((section) => (
        <section key={section.label} className="mt-12">
          <PartHeading>{section.label}</PartHeading>
          <Prose html={section.html} />
        </section>
      ))}

      {page.links.map((group) => (
        <section key={group.label} className="mt-12">
          <PartHeading>{group.label}</PartHeading>
          <ul className="mt-5 space-y-2.5 text-sm">
            {group.rows.map((row, index) => (
              <li key={`${row.href}-${index}`} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-2.5 h-px w-4 shrink-0 bg-brass" />
                <Link href={row.href} className={LINK_CLASS}>
                  {row.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {page.tags.length && tagBase ? (
        <ul className="mt-12 flex flex-wrap gap-2 border-t border-border pt-6">
          {page.tags.map((tag) => (
            <li key={tag.slug}>
              <Link href={sectionHref(tagBase, { tag: tag.slug })} className={CHIP_TAG}>
                #{tag.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {other.length ? (
        <nav className="mt-10 border-t border-border pt-6 text-sm" aria-label={t('detail.otherLanguages')}>
          <span className={KICKER}>{t('detail.otherLanguages')}</span>
          {other.map((entry) => (
            <Link key={entry.lang} href={entry.href} hrefLang={entry.lang} className={`ml-3 ${LINK_CLASS}`}>
              {languageName(entry.lang)}
            </Link>
          ))}
        </nav>
      ) : null}

      {page.listHref ? (
        <p className="mt-10">
          <Link href={page.listHref} className="group inline-flex items-center gap-3 text-sm font-medium text-ink hover:text-ink-deep">
            <span aria-hidden className="h-px w-8 bg-brass transition-all duration-200 group-hover:w-12" />
            {t('detail.backToList')} — {page.listTitle}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
