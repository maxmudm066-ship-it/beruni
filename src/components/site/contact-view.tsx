import { loadBranding } from '@/lib/site/branding';
import { siteLabeler, SOCIAL_NAMES } from '@/lib/site/dictionary';
import { Breadcrumbs, type Crumb } from '@/components/site/breadcrumbs';
import { mapFrameSrc, safeMapLink } from '@/lib/site/map';
import { ContactForm } from '@/components/site/contact-form';
import { BODY_LINK, KICKER, PAGE_HEADING, RULE } from '@/components/site/styles';

/**
 * The contacts the site keeps in Settings, in the language of the address, and the form a visitor
 * writes into.
 *
 * A content manager who replaces this page with a written one (a page whose address is `/contact`)
 * gets their own version instead: the route tries the database first.
 */
export async function ContactView({ lang, crumbs, back, notice }: { lang: string; crumbs: Crumb[]; back: string; notice: string }) {
  const t = siteLabeler(lang);
  const branding = await loadBranding(lang);

  const details = [
    { label: t('footer.address'), value: branding.address, href: '' },
    { label: t('footer.phone'), value: branding.phone, href: branding.phone ? `tel:${branding.phone.replace(/[^\d+]/g, '')}` : '' },
    { label: t('footer.email'), value: branding.email, href: branding.email ? `mailto:${branding.email}` : '' },
    { label: t('footer.hours'), value: branding.workingHours, href: '' },
  ].filter((detail) => detail.value);

  const frame = mapFrameSrc(branding.map, branding.address);
  const mapLink = safeMapLink(branding.map);

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <Breadcrumbs rows={crumbs} />
      <div className="mt-6">
        <span aria-hidden className={RULE} />
        <h1 className={`mt-4 ${PAGE_HEADING}`}>{t('footer.contacts')}</h1>
        {branding.siteName ? <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{branding.siteName}</p> : null}
      </div>

      <dl className="mt-10 border-y-2 border-ink bg-parchment/60 text-sm">
        {details.map((detail) => (
          <div key={detail.label} className="grid gap-1 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className={KICKER}>{detail.label}</dt>
            <dd className="text-[16px] leading-snug">
              {detail.href ? (
                <a href={detail.href} className={BODY_LINK}>
                  {detail.value}
                </a>
              ) : (
                <span className="whitespace-pre-line">{detail.value}</span>
              )}
            </dd>
          </div>
        ))}
        {branding.socials.length ? (
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className={`${KICKER} pt-1`}>{t('footer.follow')}</dt>
            <dd className="flex flex-wrap gap-2">
              {branding.socials.map((social) => (
                <a
                  key={social.key}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-ink/25 px-3 py-1.5 text-ink transition-colors hover:border-ink hover:bg-background"
                >
                  {SOCIAL_NAMES[social.key] ?? social.key}
                </a>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {mapLink || frame ? (
        <div className="mt-12">
          <span aria-hidden className={RULE} />
          <h2 className="mt-3 font-heading text-[22px] font-semibold tracking-tight text-ink-deep">{t('contact.map')}</h2>
          {mapLink ? (
            <a href={mapLink} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block text-sm ${BODY_LINK}`}>
              {t('contact.openMap')}
            </a>
          ) : null}
          {frame ? (
            <iframe
              src={frame}
              title={t('contact.map')}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="mt-4 h-80 w-full border border-border"
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-14">
        <ContactForm lang={lang} back={back} notice={notice} />
      </div>
    </div>
  );
}
