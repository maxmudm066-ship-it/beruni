import type { Metadata } from 'next';
import { locale } from 'next/root-params';
import '@/app/globals.css';
import { siteRootClassName } from '@/lib/fonts';
import { resolveSiteLanguage } from '@/lib/site/languages';
import { currentLanguage } from '@/lib/site/request';
import { loadBranding } from '@/lib/site/branding';
import { siteLabeler } from '@/lib/site/dictionary';
import { SiteHeader } from '@/components/site/site-header';
import { SiteFooter } from '@/components/site/site-footer';

/**
 * Root layout of the public website.
 *
 * It sits on the language segment so that `<html lang>` is the language the visitor actually
 * receives — screen readers, spell-checking and search engines all read that attribute, and the
 * panel has its own root layout for the same reason: one shared root cannot know both languages.
 *
 * A prefix the site does not speak is sent to the language the visitor was presumably after, rather
 * than shown a page in a language they did not choose.
 */
export async function generateMetadata(): Promise<Metadata> {
  const language = await resolveSiteLanguage(await locale());
  if (!language) return {};
  const branding = await loadBranding(language.code);
  const name = branding.siteName || branding.shortName;
  const suffix = branding.titleSuffix || name;

  // A person writes the ending the way they want to read it, with a pipe or without one, so a typed
  // «| Beruniy» must not become «| | Beruniy» in every browser tab of the site.
  const template = suffix ? (suffix.startsWith('|') ? `%s ${suffix}` : `%s | ${suffix}`) : '%s';

  return {
    title: { default: name, template },
    openGraph: {
      type: 'website',
      siteName: name,
      locale: language.code,
      images: branding.ogImage ? [{ url: branding.ogImage }] : undefined,
    },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const language = await currentLanguage();
  const lang = language.code;
  const skipLabel = siteLabeler(lang)('site.skipToContent');

  return (
    <html lang={lang} className={siteRootClassName}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2"
        >
          {skipLabel}
        </a>
        <SiteHeader lang={lang} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter lang={lang} />
      </body>
    </html>
  );
}
