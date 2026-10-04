import Link from 'next/link';
import { Clock, Mail, Phone } from 'lucide-react';
import { loadBranding } from '@/lib/site/branding';
import { publicMenu } from '@/lib/site/menus';
import { siteLabeler, SOCIAL_NAMES } from '@/lib/site/dictionary';
import { siteLanguages } from '@/lib/site/languages';
import { LanguageSwitcher } from '@/components/site/language-switcher';
import { SiteNav, SiteNavBar } from '@/components/site/site-nav';

/**
 * The header of every public page: the institute's name and logo from Settings, the navigation the
 * Menu Manager stores under `main`, the contacts and the language switcher. It reads the same three
 * sources the panel writes to, so nothing here needs a code change when content moves.
 */
export async function SiteHeader({ lang }: { lang: string }) {
  const [branding, items, languages] = await Promise.all([loadBranding(lang), publicMenu('main', lang), siteLanguages()]);
  const t = siteLabeler(lang);

  const switcherLanguages = languages.map((language) => ({ code: language.code, label: language.nativeName }));

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-b-ink bg-background">
      <div className="hidden bg-ink-deep text-white lg:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-5">
            {branding.phone ? (
              <a href={`tel:${branding.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 text-white/85 hover:text-white">
                <Phone aria-hidden className="size-3.5 text-brass" />
                {branding.phone}
              </a>
            ) : null}
            {branding.email ? (
              <a href={`mailto:${branding.email}`} className="inline-flex items-center gap-1.5 text-white/85 hover:text-white">
                <Mail aria-hidden className="size-3.5 text-brass" />
                {branding.email}
              </a>
            ) : null}
            {branding.workingHours ? (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <Clock aria-hidden className="size-3.5 text-brass" />
                {branding.workingHours}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-5">
            {branding.socials.length ? (
              <ul className="flex items-center gap-3">
                {branding.socials.map((social) => (
                  <li key={social.key}>
                    <a
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/85 underline-offset-4 hover:text-brass hover:underline"
                    >
                      {SOCIAL_NAMES[social.key] ?? social.key}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <LanguageSwitcher current={lang} label={t('site.language')} languages={switcherLanguages} tone="dark" />
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <Link href={`/${lang}`} className="flex min-w-0 items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the logo is a Media Library file of unknown dimensions
            <img src={branding.logoUrl} alt="" className="size-14 shrink-0 object-contain" />
          ) : (
            <span
              aria-hidden
              className="flex size-14 shrink-0 items-center justify-center border border-ink/25 bg-parchment font-heading text-xl font-semibold text-ink"
            >
              {(branding.shortName || branding.siteName || 'B').slice(0, 1)}
            </span>
          )}
          <span className="min-w-0">
            {/* A phone has no room for the full title beside the logo and the menu button, and a name
                broken into one word per line reads as a broken page: the short name takes it there. */}
            {branding.shortName && branding.shortName !== branding.siteName ? (
              <span className="block font-heading text-[15px] font-semibold leading-tight text-ink-deep lg:hidden">
                {branding.shortName}
              </span>
            ) : null}
            <span className="hidden font-heading text-[15px] font-semibold leading-tight text-ink-deep sm:block lg:text-lg">
              {branding.siteName}
            </span>
            {branding.shortName && branding.shortName !== branding.siteName ? (
              <span className="mt-0.5 hidden text-[11px] uppercase tracking-[0.14em] text-brass-deep sm:block">{branding.shortName}</span>
            ) : null}
          </span>
        </Link>

        {/* The wide bar above carries the switcher on a desktop; a narrow screen has no such bar, so
            the choice of language would otherwise disappear with it. */}
        <div className="flex shrink-0 items-center gap-3 lg:hidden">
          <LanguageSwitcher current={lang} label={t('site.language')} languages={switcherLanguages} />
          <SiteNav items={items} menuLabel={t('site.menu')} closeLabel={t('site.close')} />
        </div>
      </div>

      {/* The menu has its own row: eight section names of this length do not fit beside the institute's
          full title, and squeezing them there breaks the title into a single-word column. */}
      <div className="hidden border-t border-border/70 lg:block">
        <div className="mx-auto max-w-6xl px-4">
          <SiteNavBar items={items} menuLabel={t('site.menu')} />
        </div>
      </div>
    </header>
  );
}
