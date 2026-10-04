import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, statusLabel, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { CONTENT_TYPE_MAP, MEDIA_FIELD_ROLE } from '@/lib/content-types';
import { buildMaterialFormInit } from '@/lib/content/material-read';
import { localizedPath } from '@/lib/content/routes';
import { NONE, type MaterialFormInit } from '@/lib/content/form-types';
import { StatusPill } from '@/components/admin/status-pill';

/**
 * What a material looks like to the person who maintains it, before it goes public: same fields,
 * same reading order, no editing controls. The public templates land with the site itself and
 * this route will reuse them.
 */

/** Rendered by the blocks below, so they are not repeated in the field list. */
const HANDLED = new Set([
  'title',
  'subtitle',
  'slug',
  'lang',
  'excerpt',
  'body',
  'mainImage',
  'gallery',
  'categoryId',
  'author',
  'publishedAt',
  'tags',
  'isFeatured',
  'seoTitle',
  'seoDescription',
  'keywords',
  'canonicalUrl',
  'ogTitle',
  'ogDescription',
  'ogImage',
]);

function label(init: MaterialFormInit, name: string) {
  return init.fields.find((field) => field.name === name)?.label ?? name;
}

export default async function MaterialPreviewPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const def = CONTENT_TYPE_MAP.get(type);
  if (!def) notFound();

  const user = await requirePermission(`${def.key}.view`);
  const item = await prisma.contentItem.findUnique({
    where: { id },
    select: { id: true, lang: true, group: { select: { type: true } }, tags: { include: { tag: { include: { translations: true } } } } },
  });
  if (!item || item.group.type !== def.key) notFound();

  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const init = await buildMaterialFormInit({
    typeKey: def.key,
    itemId: item.id,
    lang: item.lang,
    locale,
    permissions: { create: false, edit: false, publish: false, review: false },
  });

  const category = init.categoryOptions.find((option) => option.value === init.scalars.categoryId)?.label;
  const author = init.authorOptions.find((option) => option.value === init.scalars.author)?.label;
  const tags = item.tags
    .map((link) => link.tag.translations.find((entry) => entry.lang === item.lang)?.name ?? link.tag.translations[0]?.name ?? link.tag.slug)
    .filter(Boolean);
  const mainImage = init.mediaValues.mainImage?.[0];
  const gallery = init.mediaValues.gallery ?? [];
  const publishedAt = init.scalars.publishedAt ? new Date(String(init.scalars.publishedAt)) : null;
  const people = Object.entries(init.personRefs).filter(([, rows]) => rows.length);
  const related = Object.entries(init.contentRefs).filter(([name, rows]) => rows.length && init.fields.find((field) => field.name === name)?.many);
  const files = Object.entries(init.mediaValues).filter(
    ([name, rows]) => rows.length && name !== 'mainImage' && name !== 'gallery' && MEDIA_FIELD_ROLE[name] !== 'og',
  );
  const extras = init.fields.filter((field) => !HANDLED.has(field.name) && field.kind !== 'richtext' && !MEDIA_FIELD_ROLE[field.name] && field.kind !== 'contentRef' && field.kind !== 'people' && field.kind !== 'authors');

  return (
    <div className="min-h-svh bg-background">
      <div className="border-b bg-muted/40">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
          <Link href={`/admin/${def.key}/${item.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
            <ArrowLeft className="size-3.5" />
            {t('form.edit')}
          </Link>
          <span className="text-muted-foreground">{t('form.previewHint')}</span>
          <span className="ml-auto flex items-center gap-2">
            <StatusPill status={init.status} label={statusLabel(locale, init.status)} />
            <span className="uppercase text-muted-foreground">{item.lang}</span>
          </span>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-4 py-10">
        <header>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{String(init.scalars.title ?? '')}</h1>
          {init.scalars.subtitle ? (
            <p className="mt-2 font-heading text-lg text-muted-foreground">{String(init.scalars.subtitle)}</p>
          ) : null}
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {category ? <span>{category}</span> : null}
            {publishedAt ? <span>{formatDateTime(publishedAt, locale)}</span> : null}
            {author ? <span>{author}</span> : null}
          </p>
        </header>

        {mainImage ? (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mainImage.asset.publicUrl} alt={mainImage.asset.altText ?? mainImage.caption} className="w-full rounded-lg border object-cover" />
            {mainImage.caption ? <figcaption className="mt-1.5 text-xs text-muted-foreground">{mainImage.caption}</figcaption> : null}
          </figure>
        ) : null}

        {init.scalars.excerpt ? <p className="mt-6 text-base leading-relaxed text-muted-foreground">{String(init.scalars.excerpt)}</p> : null}

        {init.bodies.body ? <div className="content-html mt-6" dangerouslySetInnerHTML={{ __html: init.bodies.body }} /> : null}

        {extras.length ? (
          <dl className="mt-8 grid gap-x-8 gap-y-3 border-t pt-6 text-sm sm:grid-cols-2">
            {extras.map((field) => {
              const value = init.scalars[field.name];
              if (value === null || value === undefined || value === '' || value === false || value === NONE) return null;
              const shown =
                field.kind === 'checkbox'
                  ? '✓'
                  : field.kind === 'select' || field.kind === 'category'
                    ? (field.options?.find((option) => option.value === String(value))?.label ?? String(value))
                    : String(value);
              return (
                <div key={field.name}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</dt>
                  <dd className="mt-0.5">{shown}</dd>
                </div>
              );
            })}
          </dl>
        ) : null}

        {Object.entries(init.bodies)
          .filter(([name, html]) => name !== 'body' && html.trim())
          .map(([name, html]) => (
            <section key={name} className="mt-8">
              <h2 className="font-heading text-xl font-semibold">{label(init, name)}</h2>
              <div className="content-html" dangerouslySetInnerHTML={{ __html: html }} />
            </section>
          ))}

        {people.map(([name, rows]) => (
          <section key={name} className="mt-8">
            <h2 className="font-heading text-xl font-semibold">{label(init, name)}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {rows.map((row, index) => (
                <li key={index}>
                  <span className="font-medium">{row.fullName || '—'}</span>
                  {row.note ? <span className="text-muted-foreground"> · {row.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {related.map(([name, rows]) => (
          <section key={name} className="mt-8">
            <h2 className="font-heading text-xl font-semibold">{label(init, name)}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {rows.map((row) => (
                <li key={row.detailId}>{init.refOptions[name]?.find((option) => option.detailId === row.detailId)?.label ?? '—'}</li>
              ))}
            </ul>
          </section>
        ))}

        {files.map(([name, rows]) => (
          <section key={name} className="mt-8">
            <h2 className="font-heading text-xl font-semibold">{label(init, name)}</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {rows.map((row) => (
                <li key={row.asset.id}>
                  <a href={row.asset.publicUrl} target="_blank" rel="noreferrer" className="underline">
                    {row.asset.originalName}
                  </a>
                  {row.caption ? <span className="text-muted-foreground"> — {row.caption}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {gallery.length ? (
          <section className="mt-8">
            <h2 className="font-heading text-xl font-semibold">{label(init, 'gallery')}</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {gallery.map((row) => (
                <li key={row.asset.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.asset.thumbUrl} alt={row.asset.altText ?? row.caption} className="aspect-square w-full rounded-md border object-cover" />
                  {row.caption ? <p className="mt-1 text-xs text-muted-foreground">{row.caption}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tags.length ? (
          <p className="mt-8 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {tags.map((tag) => (
              <span key={tag} className="rounded bg-muted px-2 py-0.5">
                #{tag}
              </span>
            ))}
          </p>
        ) : null}

        <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
          <p>
            {t('nav.seo')}: {String(init.scalars.seoTitle || init.scalars.title || '')}
          </p>
          <p className="mt-1">{String(init.scalars.seoDescription || init.scalars.excerpt || '')}</p>
          <p className="mt-1 font-mono">{localizedPath({ typeKey: def.key, slug: String(init.scalars.slug || '') }, item.lang)}</p>
        </footer>
      </article>
    </div>
  );
}
