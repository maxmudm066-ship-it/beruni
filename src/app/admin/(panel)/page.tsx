import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarClock, FilePen, Globe, Inbox, Languages, Megaphone, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { getDashboardMetrics } from '@/lib/admin/dashboard';
import { formatRelative } from '@/lib/admin/format';
import { CONTENT_TYPES } from '@/lib/content-types';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function DashboardPage() {
  const user = await requireUser();
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const metrics = await getDashboardMetrics();
  // The reason a publish failed is an exception text: a useful thing for an administrator to read,
  // a meaningless one for a content manager.
  const isSuperAdmin = user.permissions.includes('*');

  const typeName = (key: string) => {
    const translated = t(`type.${key}` as Parameters<typeof translate>[1]);
    return translated === `type.${key}` ? (CONTENT_TYPES.find((type) => type.key === key)?.label ?? key) : translated;
  };

  const cards: {
    key: string;
    icon: LucideIcon;
    label: string;
    value: number;
    href: string;
    tone: 'attention' | 'neutral';
    note?: string;
  }[] = [
    { key: 'review', icon: Inbox, label: t('dash.inReview'), value: metrics.counts.inReview, href: '/admin/reviews?status=in_review', tone: 'attention' },
    { key: 'scheduled', icon: CalendarClock, label: t('dash.scheduled'), value: metrics.counts.scheduled, href: '/admin/reviews?status=scheduled', tone: 'neutral' },
    { key: 'translations', icon: Languages, label: t('dash.missingTranslations'), value: metrics.counts.missingTranslations, href: '/admin/translations', tone: 'attention' },
    { key: 'expired', icon: Megaphone, label: t('dash.expiredAnnouncements'), value: metrics.counts.expiredAnnouncements, href: '/admin/announcement?expired=1', tone: 'attention' },
    { key: 'uploads', icon: AlertTriangle, label: t('dash.failedUploads'), value: metrics.counts.failedUploads, href: '/admin/media?status=failed', tone: 'attention' },
    {
      key: 'links',
      icon: Globe,
      label: t('dash.brokenLinks'),
      value: metrics.counts.brokenLinks,
      href: '/admin/links',
      tone: 'attention',
      note: metrics.linksCheckedAt
        ? `${t('audit.linkCheck')}: ${formatRelative(metrics.linksCheckedAt, locale)}`
        : t('dash.linkCheckNever'),
    },
    { key: 'drafts', icon: FilePen, label: t('dash.drafts'), value: metrics.counts.drafts, href: '/admin/reviews?status=draft', tone: 'neutral' },
    { key: 'messages', icon: Inbox, label: t('dash.newMessages'), value: metrics.counts.newMessages, href: '/admin/messages', tone: 'neutral' },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title={`${t('dash.greeting')}, ${user.displayName}`}
        description={t('dash.subtitle')}
        actions={
          user.mustChangePassword ? (
            <Link href="/admin/change-password" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <ShieldCheck />
              {t('nav.changePassword')}
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.key} href={card.href} className="group focus-visible:outline-none">
            <Card
              className={cn(
                'h-full transition-colors group-hover:bg-muted/40 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/40',
                card.value > 0 && card.tone === 'attention' && 'border-amber-500/40',
              )}
            >
              <CardContent className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <card.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-muted-foreground">{card.label}</p>
                  <p className="mt-0.5 text-2xl font-semibold tabular-nums">{card.value}</p>
                  {card.note ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{card.note}</p> : null}
                </div>
                {card.value > 0 ? (
                  <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('dash.reviewQueue')}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{metrics.counts.inReview}</span>
            </div>
            {metrics.reviewQueue.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{t('dash.allGood')}</p>
            ) : (
              <ul className="divide-y">
                {metrics.reviewQueue.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {typeName(row.type)} ·{' '}
                        {row.submittedForReviewAt ? formatRelative(row.submittedForReviewAt, locale) : '—'}
                      </p>
                    </div>
                    <StatusPill status="in_review" label={t('status.in_review')} />
                    <Link
                      href={`/admin/${row.type}/${row.id}`}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
                    >
                      {t('common.open')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('dash.upcoming')}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{metrics.counts.scheduled}</span>
            </div>
            {metrics.upcoming.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{t('dash.empty')}</p>
            ) : (
              <ul className="divide-y">
                {metrics.upcoming.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 py-2.5">
                    <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.lang.toUpperCase()}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(row.scheduledAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-sm font-semibold">{t('dash.translationGaps')}</h2>
            {metrics.translationGaps.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{t('dash.allGood')}</p>
            ) : (
              <ul className="divide-y">
                {metrics.translationGaps.map((row) => (
                  <li key={row.groupId} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{typeName(row.type)}</p>
                    </div>
                    <span className="flex shrink-0 gap-1">
                      {row.missing.map((code) => (
                        <span key={code} className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                          {code.toUpperCase()}
                        </span>
                      ))}
                    </span>
                    <Link href={`/admin/translations?group=${row.groupId}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
                      <Languages />
                      {t('common.add')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-sm font-semibold">{t('dash.recentActivity')}</h2>
            {metrics.activity.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{t('dash.empty')}</p>
            ) : (
              <ul className="divide-y">
                {metrics.activity.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{row.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.user} · {formatRelative(row.at, locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('dash.autoPublish')}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{metrics.counts.scheduled}</span>
            </div>
            {metrics.scheduledRuns.length === 0 ? (
              <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
                {t('dash.autoPublishEmpty')}
              </p>
            ) : (
              <ul className="divide-y">
                {metrics.scheduledRuns.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {typeName(row.type)} · {row.lang.toUpperCase()} · {formatRelative(row.ranAt, locale)}
                      </p>
                      {row.failed && isSuperAdmin && row.message ? (
                        <p className="mt-1 break-words text-xs text-muted-foreground">{row.message}</p>
                      ) : null}
                    </div>
                    <StatusPill
                      status={row.failed ? 'failed' : 'published'}
                      label={row.failed ? t('dash.publishFailed') : t('status.published')}
                    />
                    <Link
                      href={`/admin/${row.type}/${row.itemId}`}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
                    >
                      {t('common.open')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
