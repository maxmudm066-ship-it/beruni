import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, EyeOff, Plus, Search } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDate } from '@/lib/admin/format';
import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  REDIRECT_NOTE_MAX,
  REDIRECT_ORIGIN_KEYS,
  REDIRECT_PROBLEM_KEYS,
  REDIRECT_SOURCE_MAX,
  REDIRECT_TARGET_MAX,
  isRedirectProblem,
  redirectType,
} from '@/lib/admin/redirect-path';
import { deleteRedirect, saveRedirect, setRedirectActive } from './actions';
import { REDIRECT_NOTICES } from './notices';

const PAGE_SIZE = 25;

/** Text that travels back in the address bar: it is only ever shown as a value in the form. */
function echo(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function pageOf(raw: unknown): number {
  const value = Number.parseInt(typeof raw === 'string' ? raw : '', 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** The address of this screen with its filters, so a save returns to the same list position. */
function selfHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin/redirects?${query}` : '/admin/redirects';
}

function withParam(href: string, name: string, value: string): string {
  return `${href}${href.includes('?') ? '&' : '?'}${name}=${value}`;
}

/**
 * Redirect Manager: which old addresses now lead somewhere else. This is what keeps the links of
 * the previous site alive after a page moves, without anyone touching the server configuration.
 */
export default async function RedirectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('redirects.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const query = await searchParams;

  const q = echo(query.q, 200);
  const page = pageOf(query.page);
  const self = selfHref(q, page);

  const noticeKey = typeof query.notice === 'string' ? REDIRECT_NOTICES[query.notice] : undefined;
  const notice = noticeKey ? t(noticeKey) : '';
  const problem = typeof query.bad === 'string' && isRedirectProblem(query.bad) ? t(REDIRECT_PROBLEM_KEYS[query.bad]) : '';

  const where = q ? { OR: [{ sourcePath: { contains: q } }, { targetPath: { contains: q } }] } : {};

  const [total, rows] = await Promise.all([
    prisma.redirect.count({ where }),
    prisma.redirect.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { sourcePath: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
  ]);
  const shown = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  const editId = typeof query.edit === 'string' ? query.edit : '';
  const confirmId = typeof query.delete === 'string' ? query.delete : '';
  const draft = {
    source: echo(query.d_source, REDIRECT_SOURCE_MAX),
    target: echo(query.d_target, REDIRECT_TARGET_MAX),
    type: redirectType(echo(query.d_type, 20)),
    note: echo(query.d_note, REDIRECT_NOTE_MAX),
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={t('redirects.title')} description={t('redirects.subtitle')} />

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
          <form action="/admin/redirects" method="get" className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <label htmlFor="q" className="text-xs text-muted-foreground">
                {t('redirects.search')}
              </label>
              <Input id="q" name="q" defaultValue={q} maxLength={200} placeholder="/old-news" />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              <Search />
              {t('common.search')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mb-3 text-xs text-muted-foreground">
        {t('redirects.count')}: {total}
      </p>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {q ? t('redirects.noneFound') : t('redirects.none')}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((row) => {
            if (editId === row.id) {
              return (
                <Card key={row.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{t('redirects.edit')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form action={saveRedirect} className="space-y-4">
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="back" value={self} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label htmlFor={`source-${row.id}`} className="text-xs text-muted-foreground">
                            {t('redirects.from')}
                          </label>
                          <Input
                            id={`source-${row.id}`}
                            name="source"
                            defaultValue={row.sourcePath}
                            required
                            maxLength={REDIRECT_SOURCE_MAX}
                          />
                          <p className="text-xs text-muted-foreground">{t('redirects.fromHint')}</p>
                        </div>
                        <div className="space-y-1">
                          <label htmlFor={`target-${row.id}`} className="text-xs text-muted-foreground">
                            {t('redirects.to')}
                          </label>
                          <Input
                            id={`target-${row.id}`}
                            name="target"
                            defaultValue={row.targetPath}
                            required
                            maxLength={REDIRECT_TARGET_MAX}
                          />
                          <p className="text-xs text-muted-foreground">{t('redirects.toHint')}</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label htmlFor={`type-${row.id}`} className="text-xs text-muted-foreground">
                            {t('redirects.type')}
                          </label>
                          <select
                            id={`type-${row.id}`}
                            name="type"
                            defaultValue={row.redirectType}
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                          >
                            <option value="permanent">{t('redirects.permanent')}</option>
                            <option value="temporary">{t('redirects.temporary')}</option>
                          </select>
                          <p className="text-xs text-muted-foreground">{t('redirects.typeHint')}</p>
                        </div>
                        <div className="space-y-1">
                          <label htmlFor={`note-${row.id}`} className="text-xs text-muted-foreground">
                            {t('redirects.note')}
                          </label>
                          <Input
                            id={`note-${row.id}`}
                            name="note"
                            defaultValue={row.note ?? ''}
                            maxLength={REDIRECT_NOTE_MAX}
                          />
                          <p className="text-xs text-muted-foreground">{t('redirects.noteHint')}</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={row.isActive}
                          className="size-4 accent-primary"
                        />
                        {t('redirects.works')}
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="submit" size="sm">
                          {t('common.save')}
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={self}>{t('common.cancel')}</Link>
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card key={row.id}>
                <CardHeader>
                  {/* Addresses are case-sensitive, so the card title's uppercase style is dropped. */}
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base normal-case tracking-normal">
                    <span className="font-mono text-sm break-all">{row.sourcePath}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-sm break-all">{row.targetPath}</span>
                    {row.isActive ? null : (
                      <Badge variant="secondary" className="gap-1 font-normal">
                        <EyeOff className="size-3" />
                        {t('redirects.off')}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {t(row.redirectType === 'temporary' ? 'redirects.temporary' : 'redirects.permanent')} ·{' '}
                    {REDIRECT_ORIGIN_KEYS[row.origin] ? t(REDIRECT_ORIGIN_KEYS[row.origin]) : row.origin} ·{' '}
                    {t('redirects.hits')}: {row.hits} · {formatDate(row.createdAt, locale)}
                  </CardDescription>
                  {row.note ? <p className="mt-2 text-sm text-muted-foreground">{row.note}</p> : null}
                </CardHeader>

                <CardContent className="flex flex-wrap items-center gap-2 border-t pt-4">
                  {confirmId === row.id ? (
                    <>
                      <p className="w-full text-sm text-destructive">{t('redirects.deleteHint')}</p>
                      <form action={deleteRedirect}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="back" value={self} />
                        <Button type="submit" size="sm" variant="destructive">
                          {t('redirects.delete')}
                        </Button>
                      </form>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={self}>{t('common.cancel')}</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link href={withParam(self, 'edit', row.id)}>{t('redirects.edit')}</Link>
                      </Button>
                      <form action={setRedirectActive}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="back" value={self} />
                        <input type="hidden" name="active" value={row.isActive ? '0' : '1'} />
                        <Button type="submit" size="sm" variant="ghost">
                          {row.isActive ? t('redirects.turnOff') : t('redirects.turnOn')}
                        </Button>
                      </form>
                      <Button asChild size="sm" variant="ghost" className="text-destructive">
                        <Link href={withParam(self, 'delete', row.id)}>{t('redirects.delete')}</Link>
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
              <Link href={selfHref(q, page - 1)}>
                <ChevronLeft />
                {t('redirects.prev')}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            {t('redirects.page')} {page}
          </span>
          {hasMore ? (
            <Button asChild size="sm" variant="outline">
              <Link href={selfHref(q, page + 1)}>
                {t('redirects.next')}
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t('redirects.add')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveRedirect} className="space-y-4">
            <input type="hidden" name="back" value={self} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="new-source" className="text-xs text-muted-foreground">
                  {t('redirects.from')}
                </label>
                <Input
                  id="new-source"
                  name="source"
                  defaultValue={draft.source}
                  required
                  maxLength={REDIRECT_SOURCE_MAX}
                  placeholder="/old-news"
                />
                <p className="text-xs text-muted-foreground">{t('redirects.fromHint')}</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="new-target" className="text-xs text-muted-foreground">
                  {t('redirects.to')}
                </label>
                <Input
                  id="new-target"
                  name="target"
                  defaultValue={draft.target}
                  required
                  maxLength={REDIRECT_TARGET_MAX}
                  placeholder="/news/new-article"
                />
                <p className="text-xs text-muted-foreground">{t('redirects.toHint')}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="new-type" className="text-xs text-muted-foreground">
                  {t('redirects.type')}
                </label>
                <select
                  id="new-type"
                  name="type"
                  defaultValue={draft.type}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="permanent">{t('redirects.permanent')}</option>
                  <option value="temporary">{t('redirects.temporary')}</option>
                </select>
                <p className="text-xs text-muted-foreground">{t('redirects.typeHint')}</p>
              </div>
              <div className="space-y-1">
                <label htmlFor="new-note" className="text-xs text-muted-foreground">
                  {t('redirects.note')}
                </label>
                <Input id="new-note" name="note" defaultValue={draft.note} maxLength={REDIRECT_NOTE_MAX} />
                <p className="text-xs text-muted-foreground">{t('redirects.noteHint')}</p>
              </div>
            </div>
            <Button type="submit" size="sm">
              <Plus />
              {t('redirects.add')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
