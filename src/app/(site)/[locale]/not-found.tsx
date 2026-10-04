import Link from 'next/link';
import { locale } from 'next/root-params';
import { siteRootClassName } from '@/lib/fonts';
import { defaultSiteLanguage, resolveSiteLanguage, siteLanguages } from '@/lib/site/languages';
import { publicMenu } from '@/lib/site/menus';
import { siteLabeler } from '@/lib/site/dictionary';
import { BUTTON_PRIMARY, KICKER, PAGE_HEADING, RULE } from '@/components/site/styles';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';

/**
 * The public 404.
 *
 * It is a full document because it belongs to the root layout of this branch of the site: when a page
 * says `notFound()`, the layout is not drawn around it, so the shell — and `<html lang>` — is built
 * here as well.
 *
 * The links on it are the site's own menu, read from the database, rather than a fixed list: a section
 * a content manager adds today should be reachable from here tomorrow without anyone editing this page.
 */
export default async function SiteNotFound() {
  const language = await resolveSiteLanguage(await locale());
  const lang = language?.code ?? (await defaultSiteLanguage());
  const t = siteLabeler(lang);

  const [items, languages] = await Promise.all([publicMenu('main', lang), siteLanguages()]);
  const others = languages.filter((entry) => entry.code !== lang);

  return (
    <html lang={lang} className={siteRootClassName}>
      <body className="flex min-h-full flex-col bg-background">
        <SiteHeader lang={lang} />
        <main id="main" className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-20">
            <span aria-hidden className={RULE} />
            <h1 className={`mt-5 ${PAGE_HEADING}`}>{t('notFound.title')}</h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{t('notFound.text')}</p>
            <Link href={`/${lang}`} className={`mt-8 ${BUTTON_PRIMARY}`}>
              {t('notFound.home')}
            </Link>

            {items.length ? (
              <section className="mt-14 border-t border-border pt-6">
                <h2 className={KICKER}>{t('notFound.sections')}</h2>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} target={item.openInNewTab ? '_blank' : undefined} className="underline-offset-4 hover:underline">
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {others.length ? (
              <section className="mt-10">
                <h2 className={KICKER}>{t('notFound.languages')}</h2>
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {others.map((entry) => (
                    <li key={entry.code}>
                      <Link href={`/${entry.code}`} className="underline-offset-4 hover:underline">
                        {entry.nativeName || entry.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </main>
        <SiteFooter lang={lang} />
      </body>
    </html>
  );
}
