/**
 * The language of the page being rendered.
 *
 * Every public page and block asks for it the same way: the URL prefix, checked against the
 * languages the site actually speaks. A prefix that is not one of them is sent to `/`, where the
 * visitor gets the language they were most likely after — showing content in a guessed language
 * would be worse than one extra hop.
 */
import 'server-only';
import { redirect } from 'next/navigation';
import { locale } from 'next/root-params';
import { resolveSiteLanguage, type SiteLanguage } from '@/lib/site/languages';

export async function currentLanguage(): Promise<SiteLanguage> {
  const language = await resolveSiteLanguage(await locale());
  if (!language) redirect('/');
  return language;
}

/** The two-letter code a page needs for its queries, texts and hreflang entries. */
export async function currentLang(): Promise<string> {
  return (await currentLanguage()).code;
}
