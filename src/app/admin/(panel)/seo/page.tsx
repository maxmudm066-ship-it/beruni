import Link from 'next/link';
import { ChevronLeft, ChevronRight, EyeOff, Plus, Search } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, mediaPickerLabels, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDate } from '@/lib/admin/format';
import {
  SEO_CANONICAL_MAX,
  SEO_DESCRIPTION_MAX,
  SEO_KEYWORDS_MAX,
  SEO_PATH_MAX,
  SEO_PROBLEM_KEYS,
  SEO_TITLE_MAX,
  isSeoProblem,
} from '@/lib/admin/seo-address';
import { listingRoutes } from '@/lib/site/routing';
import { sectionName } from '@/lib/site/dictionary';
import { siteLanguages } from '@/lib/site/languages';
import { toPickedMedia } from '@/lib/content/media-value';
import { PageHeader } from '@/components/admin/page-header';
import { ImageField } from '@/components/admin/image-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PickedMedia } from '@/components/admin/media/media-types';
import { deleteRouteSeo, saveRouteSeo } from './actions';
import { SEO_NOTICES } from './notices';

const PAGE_SIZE = 25;
const SELECT_CLASS = 'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm';

/** Text that travels back in the address bar: it is only ever shown as a value in the form. */
function echo(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function pageOf(raw: unknown): number {
  const value = Number.parseInt(typeof raw === 'string' ? raw : '', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** The address of this screen with its filters, so a save returns to the same list position. */
function selfHref(q: string, lang: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (lang) params.set('lang', lang);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin/seo?${query}` : '/admin/seo';
}

function withParam(href: string, name: string, value: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}${name}=${value}`;
}

interface Row {
  id: string;
  lang: string;
  routePath: string;
  title: string | null;
  description: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageAssetId: string | null;
  noIndex: boolean;
  updatedAt: Date;
}

/** What a person actually set on one address, in words they chose themselves. */
function summary(row: Row, t: (key: TranslationKey) => string): string {
  const parts: string[] = [];
  if (row.title) parts.push(t('seo.fieldTitle'));
  if (row.description) parts.push(t('seo.description'));
  if (row.keywords) parts.push(t('seo.keywords'));
  if (row.canonicalUrl) parts.push(t('seo.canonical'));
  if (row.ogTitle || row.ogDescription || row.ogImageAssetId) parts.push(t('seo.ogImage'));
  return parts.length ? `${t('seo.set')}: ${parts.join(', ')}` : t('seo.empty');
}

interface Draft {
  lang: string;
  path: string;
  title: string;
  description: string;
  keywords: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
}

/**
 * SEO by address: what a search engine is told about a page whose own text says nothing about it —
 * a section, the home page, or any address at all. Every field is optional; an empty one leaves the
 * page alone.
 */
export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('seo.view');
  const canEdit = user.permissions.includes('*') || user.permissions.includes('seo.edit');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const q = echo(query.q, 200);
  const langFilter = echo(query.lang, 12);
  const page = pageOf(query.page);
  const self = selfHref(q, langFilter, page);

  const noticeKey = typeof query.notice === 'string' ? SEO_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const problem = typeof query.bad === 'string' && isSeoProblem(query.bad) ? t(SEO_PROBLEM_KEYS[query.bad]) : '';

  const [languages, total, rows] = await Promise.all([
    siteLanguages(),
    prisma.routeSeo.count({ where: whereOf(q, langFilter) }),
    prisma.routeSeo.findMany({
      where: whereOf(q, langFilter),
      orderBy: [{ updatedAt: 'desc' }, { routePath: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
  ]);
  const shown = rows.slice(0, PAGE_SIZE) as Row[];
  const hasMore = rows.length > PAGE_SIZE;
  const codes = new Set(languages.map((language) => language.code));

  const editId = typeof query.edit === 'string' ? query.edit : '';
  const confirmId = typeof query.delete === 'string' ? query.delete : '';
  const draft: Draft = {
    lang: codes.has(echo(query.d_lang, 12)) ? echo(query.d_lang, 12) : (codes.has(langFilter) ? langFilter : languages[0]?.code ?? ''),
    path: echo(query.d_path, SEO_PATH_MAX),
    title: echo(query.d_title, SEO_TITLE_MAX),
    description: echo(query.d_description, SEO_DESCRIPTION_MAX),
    keywords: echo(query.d_keywords, SEO_KEYWORDS_MAX),
    canonical: echo(query.d_canonical, SEO_CANONICAL_MAX),
    ogTitle: echo(query.d_ogTitle, SEO_TITLE_MAX),
    ogDescription: echo(query.d_ogDescription, SEO_DESCRIPTION_MAX),
  };

  const imageIds = shown.map((row) => row.ogImageAssetId).filter((id): id is string => Boolean(id));
  const mediaRows = imageIds.length
    ? await prisma.media.findMany({ where: { id: { in: imageIds }, kind: 'image' }, include: { variants: true } })
    : [];
  const mediaById = new Map<string, PickedMedia>(mediaRows.map((row) => [row.id, toPickedMedia(row)]));

  const configured = new Set(shown.map((row) => `${row.lang}\u0000${row.routePath}`));
  const pickerLabels = mediaPickerLabels(locale);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('seo.title')} description={t('seo.subtitle')} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      {problem ? (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {problem}
        </p>
      ) : null}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form action="/admin/seo" method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="q" className="text-xs text-muted-foreground">
                {t('seo.search')}
              </label>
              <Input id="q" name="q" defaultValue={q} maxLength={200} placeholder="/ru/news" />
            </div>
            <div className="w-40 space-y-1">
              <label htmlFor="lang" className="text-xs text-muted-foreground">
                {t('seo.language')}
              </label>
              <select id="lang" name="lang" defaultValue={langFilter} className={SELECT_CLASS}>
                <option value="">{t('seo.allLanguages')}</option>
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.nativeName || language.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              <Search />
              {t('common.search')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mb-3 text-xs text-muted-foreground">
        {t('seo.count')}: {total}
      </p>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {q || langFilter ? t('seo.noneFound') : t('seo.none')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => {
            const label = languages.find((language) => language.code === row.lang)?.nativeName ?? row.lang;
            if (canEdit && editId === row.id) {
              return (
                <Card key={row.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{t('seo.edit')}</CardTitle>
                    <CardDescription>{t('seo.inherited')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SeoForm
                      row={row}
                      id={row.id}
                      back={self}
                      action={saveRouteSeo}
                      languages={languages}
                      image={row.ogImageAssetId ? (mediaById.get(row.ogImageAssetId) ?? null) : null}
                      pickerLabels={pickerLabels}
                      t={t}
                    />
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={row.id}>
                <CardHeader>
                  {/* Addresses are case-sensitive, so the card title's uppercase style is dropped. */}
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base normal-case tracking-normal">
                    <Badge variant="secondary" className="font-normal">
                      {label}
                    </Badge>
                    <span className="font-mono text-sm break-all">{row.routePath}</span>
                    {row.noIndex ? (
                      <Badge variant="outline" className="gap-1 font-normal">
                        <EyeOff className="size-3" />
                        {t('seo.hidden')}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription>
                    {summary(row, t)} · {formatDate(row.updatedAt, locale)}
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {canEdit && confirmId === row.id ? (
                    <>
                      <p className="w-full text-sm text-destructive">{t('seo.deleteHint')}</p>
                      <form action={deleteRouteSeo}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="back" value={self} />
                        <Button type="submit" size="sm" variant="destructive">
                          {t('seo.delete')}
                        </Button>
                      </form>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={self}>{t('common.cancel')}</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      {canEdit ? (
                        <>
                          <Button asChild size="sm" variant="outline">
                            <Link href={withParam(self, 'edit', row.id)}>{t('seo.edit')}</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="text-destructive">
                            <Link href={withParam(self, 'delete', row.id)}>{t('seo.delete')}</Link>
                          </Button>
                        </>
                      ) : null}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={siteAddress(row.lang, row.routePath)} target="_blank">
                          {t('common.open')}
                        </Link>
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {page > 1 || hasMore ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={selfHref(q, langFilter, page - 1)}>
                <ChevronLeft />
                {t('seo.prev')}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {t('seo.page')} {page}
          </span>
          {hasMore ? (
            <Button asChild size="sm" variant="outline">
              <Link href={selfHref(q, langFilter, page + 1)}>
                {t('seo.next')}
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      {canEdit ? (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">{t('seo.choose')}</CardTitle>
              <CardDescription>{t('seo.chooseHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {languages.map((language) => (
                <div key={language.code}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {language.nativeName || language.name}
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {addressOptions(language.code, t, locale).map((option) => (
                      <li key={option.path}>
                        <Button asChild size="sm" variant={configured.has(`${language.code}\u0000${option.path}`) ? 'secondary' : 'outline'}>
                          <Link href={prefillHref(self, language.code, option.path)}>{option.label}</Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="size-4" />
                {t('seo.add')}
              </CardTitle>
              <CardDescription>{t('seo.inherited')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SeoForm
                row={null}
                id=""
                back={self}
                action={saveRouteSeo}
                languages={languages}
                image={null}
                draft={draft}
                pickerLabels={pickerLabels}
                t={t}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function whereOf(q: string, lang: string) {
  return {
    ...(q ? { routePath: { contains: q } } : {}),
    ...(/^[a-z0-9-]{2,12}$/i.test(lang) ? { lang } : {}),
  };
}

/** The public page an address belongs to, for the person who wants to look at it before writing about it. */
function siteAddress(lang: string, routePath: string): string {
  const wanted = routePath.replace(/^\/+/, '');
  return wanted.startsWith(`${lang}/`) ? `/${wanted}` : `/${lang}/${wanted}`;
}

function prefillHref(self: string, lang: string, path: string): string {
  const params = new URLSearchParams();
  params.set('d_lang', lang);
  params.set('d_path', path);
  return `${self}${self.includes('?') ? '&' : '?'}${params.toString()}`;
}

/** Home, contacts and every section of the site — the addresses that belong to nobody's text. */function addressOptions(
  lang: string,
  t: (key: TranslationKey) => string,
  locale: AdminLocale,
): { path: string; label: string }[] {
  const out = [{ path: `/${lang}`, label: t('seo.home') }, { path: `/${lang}/contact`, label: t('seo.contact') }];
  for (const spec of listingRoutes()) {
    out.push({ path: `/${lang}/${spec.path}`, label: sectionName(locale, spec.title, spec.typeKey) });
  }
  return out;
}

interface FormProps {
  row: Row | null;
  id: string;
  back: string;
  action: (form: FormData) => Promise<void>;
  languages: { code: string; nativeName: string; name: string }[];
  image: PickedMedia | null;
  draft?: Draft;
  pickerLabels: Parameters<typeof ImageField>[0]['pickerLabels'];
  t: (key: TranslationKey) => string;
}

/** One form: the address it speaks about, and the fields that may be overridden. */
function SeoForm({ row, id, back, action, languages, image, draft, pickerLabels, t }: FormProps) {
  const stored = {
    title: row?.title ?? draft?.title ?? '',
    description: row?.description ?? draft?.description ?? '',
    keywords: row?.keywords ?? draft?.keywords ?? '',
    canonical: row?.canonicalUrl ?? draft?.canonical ?? '',
    ogTitle: row?.ogTitle ?? draft?.ogTitle ?? '',
    ogDescription: row?.ogDescription ?? draft?.ogDescription ?? '',
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="back" value={back} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-lang`} className="text-xs text-muted-foreground">
            {t('seo.language')}
          </label>
          <select id={`${id}-lang`} name="lang" defaultValue={row?.lang ?? draft?.lang ?? languages[0]?.code ?? ''} className={SELECT_CLASS} required>
            {languages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.nativeName || language.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-path`} className="text-xs text-muted-foreground">
            {t('seo.address')}
          </label>
          <Input id={`${id}-path`} name="path" defaultValue={row?.routePath ?? draft?.path ?? ''} required maxLength={SEO_PATH_MAX} placeholder="/ru/news" />
          <p className="text-xs text-muted-foreground">{t('seo.addressHint')}</p>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-title`} className="text-xs text-muted-foreground">
          {t('seo.fieldTitle')}
        </label>
        <Input id={`${id}-title`} name="title" defaultValue={stored.title} maxLength={SEO_TITLE_MAX} />
        <p className="text-xs text-muted-foreground">{t('seo.fieldTitleHint')}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor={`${id}-description`} className="text-xs text-muted-foreground">
          {t('seo.description')}
        </label>
        <Textarea id={`${id}-description`} name="description" defaultValue={stored.description} maxLength={SEO_DESCRIPTION_MAX} rows={2} />
        <p className="text-xs text-muted-foreground">{t('seo.descriptionHint')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-keywords`} className="text-xs text-muted-foreground">
            {t('seo.keywords')}
          </label>
          <Input id={`${id}-keywords`} name="keywords" defaultValue={stored.keywords} maxLength={SEO_KEYWORDS_MAX} />
          <p className="text-xs text-muted-foreground">{t('seo.keywordsHint')}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-canonical`} className="text-xs text-muted-foreground">
            {t('seo.canonical')}
          </label>
          <Input id={`${id}-canonical`} name="canonical" defaultValue={stored.canonical} maxLength={SEO_CANONICAL_MAX} />
          <p className="text-xs text-muted-foreground">{t('seo.canonicalHint')}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-ogTitle`} className="text-xs text-muted-foreground">
            {t('seo.ogTitle')}
          </label>
          <Input id={`${id}-ogTitle`} name="ogTitle" defaultValue={stored.ogTitle} maxLength={SEO_TITLE_MAX} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-ogDescription`} className="text-xs text-muted-foreground">
            {t('seo.ogDescription')}
          </label>
          <Input id={`${id}-ogDescription`} name="ogDescription" defaultValue={stored.ogDescription} maxLength={SEO_DESCRIPTION_MAX} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">{t('seo.ogImage')}</p>
        <ImageField
          name="ogImage"
          value={image}
          labels={{
            pick: t('media.pickFromLibrary'),
            change: t('media.change'),
            remove: t('media.remove'),
            title: t('media.pickFromLibrary'),
          }}
          pickerLabels={pickerLabels}
        />
        <p className="text-xs text-muted-foreground">{t('seo.ogImageHint')}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="noIndex" defaultChecked={row?.noIndex ?? false} className="size-4 accent-primary" />
        {t('seo.noIndex')}
      </label>
      <p className="text-xs text-muted-foreground">{t('seo.noIndexHint')}</p>

      <Button type="submit" size="sm">
        {row ? t('common.save') : t('seo.add')}
      </Button>
      {row ? (
        <Button asChild size="sm" variant="ghost">
          <Link href={back}>{t('common.cancel')}</Link>
        </Button>
      ) : null}
    </form>
  );
}
