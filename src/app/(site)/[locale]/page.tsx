import type { Metadata } from 'next';
import { locale } from 'next/root-params';
import { homepageBlocks } from '@/lib/site/homepage';
import { loadBranding } from '@/lib/site/branding';
import { resolveSiteLanguage } from '@/lib/site/languages';
import { applyStoredRedirect } from '@/lib/site/redirects';
import { currentLang } from '@/lib/site/request';
import { pageMetadata } from '@/lib/site/seo';
import { HomepageBlocks } from '@/components/site/homepage-blocks';

/**
 * The home page. What a visitor scrolls through is decided in the Homepage Builder, in the order set
 * there, and only in the language of the address they used.
 */
export async function generateMetadata(): Promise<Metadata> {
  const language = await resolveSiteLanguage(await locale());
  if (!language) return {};
  const branding = await loadBranding(language.code);

  // The name of the institute is the title of its own front door, so it is not written twice with
  // the Settings ending; staff who want a different wording put it in SEO by address for `/uz`.
  return pageMetadata({
    lang: language.code,
    path: `/${language.code}`,
    title: branding.siteName || branding.shortName,
    absoluteTitle: true,
  });
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The home page of a language can itself be an old address: `/ru` was once something else.
  await applyStoredRedirect(`/${await locale()}`);

  const lang = await currentLang();
  const [blocks, query] = await Promise.all([homepageBlocks(lang), searchParams]);
  const back = `/${lang}`;

  // The contact block's form answers in the address of the page it sits on, so the notice is read here.
  const notice =
    typeof query.sent === 'string' ? 'sent' : typeof query.bad === 'string' ? query.bad : '';

  return <HomepageBlocks blocks={blocks} lang={lang} back={back} notice={notice} />;
}
