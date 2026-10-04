import Link from 'next/link';
import type { HomepageBlock } from '@/lib/site/homepage';
import { loadBranding } from '@/lib/site/branding';
import { siteLabeler, SOCIAL_NAMES } from '@/lib/site/dictionary';
import { mapFrameSrc, safeMapLink } from '@/lib/site/map';
import { ContactForm } from '@/components/site/contact-form';
import { MaterialCard } from '@/components/site/material-card';
import { ARROW_LINK, BUTTON_ON_IMAGE, BUTTON_ON_IMAGE_PRIMARY, BUTTON_PRIMARY, BUTTON_SECONDARY, KICKER, RULE, SECTION_HEADING } from '@/components/site/styles';

const GRID_COLUMNS: Record<number, string> = {
  1: '',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

const HERO_HEIGHT: Record<string, string> = {
  small: 'min-h-[300px]',
  medium: 'min-h-[440px]',
  large: 'min-h-[560px]',
};

/**
 * The homepage blocks, in the order the Homepage Builder holds them.
 *
 * A block that has nothing to show is left out entirely: an empty "Latest news" heading with no
 * cards under it reads as a broken site, while the absent block simply is not there yet.
 *
 * `back` and `notice` belong to the contact block's form: the answer to a letter comes back to the
 * very page it was written on, in the address of this page.
 *
 * The bands alternate between paper and parchment as they are met, not by their type, so a page that
 * starts with three lists still reads as a rhythm rather than one long grey column.
 */
export function HomepageBlocks({
  blocks,
  lang,
  back,
  notice,
}: {
  blocks: HomepageBlock[];
  lang: string;
  back: string;
  notice: string;
}) {
  let band = 0;

  return (
    <>
      {blocks.map((block) => {
        if (block.type === 'hero') return <Hero key={block.id} block={block} />;
        if (!block.items.length && block.type !== 'about' && block.type !== 'contact') return null;
        const tone = band++ % 2 === 0 ? 'paper' : 'parchment';
        if (block.type === 'about') return <Split key={block.id} block={block} tone={tone} />;
        if (block.type === 'contact') return <Contacts key={block.id} block={block} lang={lang} back={back} notice={notice} tone={tone} />;
        return <MaterialList key={block.id} block={block} lang={lang} tone={tone} />;
      })}
    </>
  );
}

/** Paper or parchment: the two grounds a page alternates between. */
const BAND: Record<'paper' | 'parchment', string> = {
  paper: 'bg-background',
  parchment: 'bg-parchment/70',
};

function Buttons({ buttons, tone = 'dark' }: { buttons: HomepageBlock['buttons']; tone?: 'dark' | 'light' }) {
  if (!buttons.length) return null;
  return (
    <div className="mt-7 flex flex-wrap gap-3">
      {buttons.map((button, index) => (
        <Link
          key={button.href + index}
          href={button.href}
          className={
            index === 0
              ? tone === 'light'
                ? BUTTON_ON_IMAGE_PRIMARY
                : BUTTON_PRIMARY
              : tone === 'light'
                ? BUTTON_ON_IMAGE
                : BUTTON_SECONDARY
          }
        >
          {button.text}
        </Link>
      ))}
    </div>
  );
}

/** A heading with the brass rule above it, which is how every band of the site opens. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <span aria-hidden className={RULE} />
      <h2 className={`mt-4 ${SECTION_HEADING}`}>{children}</h2>
    </div>
  );
}

/** The link that leads from a band to the whole section: its rule lengthens as the pointer arrives. */
function OnwardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={ARROW_LINK}>
      <span>{children}</span>
      <span aria-hidden className="h-px w-6 bg-brass transition-all duration-200 group-hover:w-10" />
    </Link>
  );
}

function Hero({ block }: { block: HomepageBlock }) {
  const height = HERO_HEIGHT[String(block.config.height ?? 'medium')] ?? HERO_HEIGHT.medium;
  const dark = block.config.darkOverlay !== false;

  return (
    <section id="hero" className={`relative flex items-center overflow-hidden bg-ink-deep ${height}`}>
      {block.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired
        <img src={block.image.url} alt={block.image.alt} className="absolute inset-0 size-full object-cover" />
      ) : null}
      {/* Lapis rather than black: a photograph under a grey scrim looks dim, under a blue one it looks
          like the institute's own photograph. */}
      <div aria-hidden className={`absolute inset-0 ${dark ? 'bg-gradient-to-r from-ink-deep/95 via-ink-deep/78 to-ink/40' : 'bg-ink-deep/25'}`} />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12">
        <div className="max-w-2xl">
          <span aria-hidden className="block h-[3px] w-16 bg-brass" />
          <h1 className="mt-6 font-heading text-[30px] font-semibold leading-[1.15] text-white sm:text-4xl lg:text-[46px]">
            {block.heading}
          </h1>
          {block.subheading ? <p className="mt-4 text-base leading-relaxed text-white/85 sm:text-lg">{block.subheading}</p> : null}
          <Buttons buttons={block.buttons} tone="light" />
        </div>
      </div>
    </section>
  );
}

function Split({ block, tone }: { block: HomepageBlock; tone: 'paper' | 'parchment' }) {
  const imageFirst = block.config.layout === 'left';
  const picture = block.image ? (
    <div className="relative">
      {/* A frame laid behind the photograph, offset: the one ornament this site allows itself, and it
          costs no pixels of the picture itself. */}
      <span aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 border-2 border-brass sm:translate-x-4 sm:translate-y-4" />
      {/* eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired */}
      <img src={block.image.url} alt={block.image.alt} loading="lazy" className="relative aspect-[4/3] w-full object-cover" />
    </div>
  ) : null;

  return (
    <section id={block.type} className={`border-t border-border ${BAND[tone]}`}>
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-14">
        {imageFirst ? (
          <>
            {picture}
            <BlockText block={block} />
          </>
        ) : (
          <>
            <BlockText block={block} />
            {picture}
          </>
        )}
      </div>
    </section>
  );
}

function BlockText({ block }: { block: HomepageBlock }) {
  return (
    <div>
      <SectionTitle>{block.heading}</SectionTitle>
      {block.subheading ? <p className="mt-3 text-lg leading-relaxed text-ink-deep/80">{block.subheading}</p> : null}
      {block.body ? <p className="mt-5 whitespace-pre-line text-[17px] leading-[1.75]">{block.body}</p> : null}
      <Buttons buttons={block.buttons} />
    </div>
  );
}

function MaterialList({ block, lang, tone }: { block: HomepageBlock; lang: string; tone: 'paper' | 'parchment' }) {
  const t = siteLabeler(lang);
  return (
    <section id={block.type} className={`border-t border-border ${BAND[tone]}`}>
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle>{block.heading}</SectionTitle>
          {block.buttons[0] ? <OnwardLink href={block.buttons[0].href}>{block.buttons[0].text || t('common.all')}</OnwardLink> : null}
        </div>
        {block.subheading ? <p className="mt-3 max-w-3xl text-[17px] leading-relaxed text-muted-foreground">{block.subheading}</p> : null}

        {block.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired
          <img src={block.image.url} alt={block.image.alt} loading="lazy" className="mt-8 max-h-96 w-full object-cover" />
        ) : null}

        <div className={`mt-9 grid gap-6 ${GRID_COLUMNS[block.columns] ?? GRID_COLUMNS[3]}`}>
          {block.items.map((item) => (
            <MaterialCard key={item.itemId} item={item} lang={lang} showImage={block.showImages} />
          ))}
        </div>
      </div>
    </section>
  );
}

async function Contacts({
  block,
  lang,
  back,
  notice,
  tone,
}: {
  block: HomepageBlock;
  lang: string;
  back: string;
  notice: string;
  tone: 'paper' | 'parchment';
}) {
  const t = siteLabeler(lang);
  const branding = await loadBranding(lang);
  const details = [
    { label: t('footer.address'), value: branding.address },
    { label: t('footer.phone'), value: branding.phone, href: branding.phone ? `tel:${branding.phone.replace(/[^\d+]/g, '')}` : undefined },
    { label: t('footer.email'), value: branding.email, href: branding.email ? `mailto:${branding.email}` : undefined },
    { label: t('footer.hours'), value: branding.workingHours },
  ].filter((detail) => detail.value);

  // Two switches the block screen offers: the map the institute is on, and the form a visitor writes into.
  const showMap = block.config.showMap !== false;
  const showForm = block.config.showForm !== false;
  const frame = showMap ? mapFrameSrc(branding.map, branding.address) : null;
  const mapLink = showMap ? safeMapLink(branding.map) : null;

  return (
    <>
      <section id={block.type} className={`border-t border-border ${BAND[tone]}`}>
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-14">
          <div>
            <SectionTitle>{block.heading}</SectionTitle>
            {block.subheading ? <p className="mt-3 text-lg leading-relaxed text-ink-deep/80">{block.subheading}</p> : null}
            {block.body ? <p className="mt-5 whitespace-pre-line text-[17px] leading-[1.75]">{block.body}</p> : null}
            <Buttons buttons={block.buttons} />
          </div>
          <dl className="divide-y divide-border border-y border-border text-sm">
            {details.map((detail) => (
              <div key={detail.label} className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className={KICKER}>{detail.label}</dt>
                <dd className="text-[17px] leading-snug">
                  {detail.href ? (
                    <a href={detail.href} className="text-ink underline decoration-brass decoration-1 underline-offset-[3px] hover:decoration-2">
                      {detail.value}
                    </a>
                  ) : (
                    <span className="whitespace-pre-line">{detail.value}</span>
                  )}
                </dd>
              </div>
            ))}
            {branding.socials.length ? (
              <div className="grid gap-2 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className={`${KICKER} pt-1`}>{t('footer.follow')}</dt>
                <dd className="flex flex-wrap gap-2">
                  {branding.socials.map((social) => (
                    <a
                      key={social.key}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-ink/25 px-3 py-1.5 text-ink transition-colors hover:border-ink hover:bg-parchment"
                    >
                      {SOCIAL_NAMES[social.key] ?? social.key}
                    </a>
                  ))}
                </dd>
              </div>
            ) : null}
            {mapLink ? (
              <div className="grid gap-1 py-4 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className={KICKER}>{t('contact.map')}</dt>
                <dd>
                  <a href={mapLink} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-brass decoration-1 underline-offset-[3px] hover:decoration-2">
                    {t('contact.openMap')}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {frame ? (
          <div className="mx-auto max-w-6xl px-4 pb-16">
            <iframe
              src={frame}
              title={t('contact.map')}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-80 w-full border border-border"
            />
          </div>
        ) : null}
      </section>
      {showForm ? (
        <div className="mx-auto max-w-6xl px-4 pb-16">
          <ContactForm lang={lang} back={back} notice={notice} />
        </div>
      ) : null}
    </>
  );
}
