import { KeyRound, MonitorSmartphone, ShieldCheck, ShieldOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { startTwoFactor } from './actions';
import { TwoFactorDisableForm } from './two-factor-forms';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ enabled?: string; off?: string }>;
}) {
  const user = await requireUser();
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { enabled, off } = await searchParams;
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorSecret: true },
  });
  const isOn = account?.twoFactorEnabled === true;
  const isPending = !isOn && Boolean(account?.twoFactorSecret);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title={t('security.title')} description={t('security.description')} />

      {enabled || off ? (
        <p
          className={
            off
              ? 'mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
              : 'mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
          }
        >
          {off ? t('security.disabled') : t('security.enabled')}
        </p>
      ) : null}

      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <section className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('login.password')}</p>
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t('security.passwordHint')}</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/change-password">{t('security.manage')}</Link>
            </Button>
          </section>

          <Separator />

          <section className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3">
              {isOn ? (
                <ShieldCheck className="mt-0.5 size-4 text-emerald-600" />
              ) : (
                <ShieldOff className="mt-0.5 size-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">{isOn ? t('security.twoFactorOn') : t('security.twoFactorOff')}</p>
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t('security.twoFactorHint')}</p>
              </div>
            </div>

            {isOn ? (
              <TwoFactorDisableForm labels={{ code: t('security.codeToDisable'), submit: t('security.turnOff') }} />
            ) : (
              <form action={startTwoFactor}>
                <Button size="sm" variant={isPending ? 'outline' : 'default'} type="submit">
                  {isPending ? t('security.manage') : t('security.turnOn')}
                </Button>
              </form>
            )}
          </section>

          <Separator />

          <section className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-start gap-3">
              <MonitorSmartphone className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t('security.sessions')}</p>
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{t('security.sessionsHint')}</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/sessions">{t('security.manage')}</Link>
            </Button>
          </section>
        </CardContent>
      </Card>

    </div>
  );
}
