import Link from 'next/link';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { loadBranding } from '@/lib/site/branding';
import { publicMenu, type PublicNavItem } from '@/lib/site/menus';
import { siteLabeler, SOCIAL_NAMES } from '@/lib/site/dictionary';
import { cn } from '@/lib/utils';

/**
 * The footer: contacts from Settings, the navigation stored under `footer`, and the copyright line
 * a content manager writes in Settings. Every value that is empty in the panel leaves its block out
 * instead of printing an empty heading.
 */
export async function SiteFooter({ lang }: { lang: string }) {
  const [branding, items] = await Promise.all([loadBranding(lang), publicMenu('footer', lang)]);
  const t = siteLabeler(lang);
  const year = new Date().getFullYear();
  const name = branding.shortName || branding.siteName;

  return (
    <footer className="mt-auto bg-ink-deep text-white/80">
      {/* One brass line separates the page from the institute's own address, the way a rule closes a
          printed page. */}
      <div aria-hidden className="h-[3px] bg-brass" />

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="font-heading text-lg font-semibold leading-snug text-white">{branding.siteName}</p>
          <span aria-hidden className="block h-px w-10 bg-brass" />
          {branding.footerNote ? <p className="text-sm leading-relaxed text-white/60">{branding.footerNote}</p> : null}
        </div>

        {items.length ? (
          <nav aria-label={t('site.menu')}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">{t('site.menu')}</p>
            <FooterList items={items} />
          </nav>
        ) : null}

        <div className="space-y-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">{t('footer.contacts')}</p>
          {branding.address ? (
            <p className="flex gap-2.5 text-white/70">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brass/80" />
              <span className="whitespace-pre-line">{branding.address}</span>
            </p>
          ) : null}
          {branding.phone ? (
            <p className="flex gap-2.5">
              <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-brass/80" />
              <a href={`tel:${branding.phone.replace(/[^\d+]/g, '')}`} className="text-white/85 underline-offset-4 hover:text-white hover:underline">
                {branding.phone}
              </a>
            </p>
          ) : null}
          {branding.email ? (
            <p className="flex gap-2.5">
              <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-brass/80" />
              <a href={`mailto:${branding.email}`} className="text-white/85 underline-offset-4 hover:text-white hover:underline">
                {branding.email}
              </a>
            </p>
          ) : null}
          {branding.workingHours ? (
            <p className="flex gap-2.5 text-white/70">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-brass/80" />
              <span>{branding.workingHours}</span>
            </p>
          ) : null}
        </div>

        {branding.socials.length ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brass">{t('footer.follow')}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {branding.socials.map((social) => (
                <li key={social.key}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-white/20 px-3 py-1.5 text-white/85 transition-colors hover:border-brass hover:text-white"
                  >
                    {SOCIAL_NAMES[social.key] ?? social.key}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-white/12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-white/50">
          <p>
            © {year} {name}. {t('footer.rights')}
          </p>
          <Link href={`/${lang}`} className="uppercase tracking-[0.14em] text-white/70 underline-offset-4 hover:text-brass hover:underline">
            {t('site.home')}
          </Link>
        </div>
      </div>
    </footer>
  );
}

/**
 * The stored footer menu, including the items nested under it. The Menu Manager builds the same tree
 * for the footer as for the header, so a second level written by a content manager has to appear.
 */
function FooterList({ items, depth = 0 }: { items: PublicNavItem[]; depth?: number }) {
  return (
    <ul className={cn('mt-3 space-y-2 text-sm', depth > 0 && 'ml-3 mt-1.5 space-y-1 border-l border-white/15 pl-3 text-white/60')}>
      {items.map((item) => (
        <li key={item.id}>
          {/^https?:/i.test(item.href) ? (
            <a
              href={item.href}
              target={item.openInNewTab ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="text-white/80 underline-offset-4 hover:text-brass hover:underline"
            >
              {item.title}
            </a>
          ) : (
            <Link href={item.href} className="text-white/80 underline-offset-4 hover:text-brass hover:underline">
              {item.title}
            </Link>
          )}
          {item.children.length ? <FooterList items={item.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}
