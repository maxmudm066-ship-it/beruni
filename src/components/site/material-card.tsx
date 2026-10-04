import Link from 'next/link';
import { formatDate } from '@/lib/admin/format';
import type { PublicMaterial } from '@/lib/site/materials';
import { KICKER } from '@/components/site/styles';

/**
 * One material as the public site shows it: picture, date, title, short description. Used by the
 * homepage blocks and by every listing page, so a material looks the same wherever it appears.
 *
 * The card has no box around it and the date no decoration: on a page of six of them a border reads
 * as six separate products, while the rule above the title marks each as one article of a single
 * newspaper — which is what a listing of an institute's life is.
 */
export function MaterialCard({
  item,
  lang,
  showImage = true,
  readMoreLabel,
}: {
  item: PublicMaterial;
  lang: string;
  showImage?: boolean;
  readMoreLabel?: string;
}) {
  const kind = [item.category, item.meta].filter(Boolean).join(' · ');

  return (
    <article className="group flex h-full flex-col bg-card">
      {showImage && item.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- media sizes vary; the site serves the stored file as-is until image optimisation is wired
        <img src={item.image.url} alt={item.image.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
      ) : null}
      <div className="flex flex-1 flex-col border border-t-[3px] border-border border-t-brass bg-card px-5 pb-5 pt-4 transition-colors group-hover:border-ink/35">
        {item.publishedAt ? (
          <time dateTime={item.publishedAt.toISOString()} className={KICKER}>
            {formatDate(item.publishedAt, lang)}
          </time>
        ) : null}
        <h3 className="mt-1.5 font-heading text-[19px] font-semibold leading-snug text-ink-deep">
          <Link href={item.href} className="underline-offset-4 group-hover:underline group-hover:decoration-brass">
            {item.title}
          </Link>
        </h3>
        {kind ? <p className="mt-2 text-xs uppercase tracking-[0.1em] text-muted-foreground">{kind}</p> : null}
        {item.excerpt ? <p className="mt-2.5 line-clamp-4 text-[15px] leading-relaxed text-muted-foreground">{item.excerpt}</p> : null}
        {readMoreLabel ? (
          <Link
            href={item.href}
            className="mt-auto inline-flex items-center gap-2 pt-4 text-sm font-medium text-ink transition-colors hover:text-ink-deep"
          >
            {readMoreLabel}
            <span aria-hidden className="h-px w-5 bg-brass transition-all duration-200 group-hover:w-8" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
