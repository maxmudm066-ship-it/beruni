import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/session';
import { totpUri } from '@/lib/auth/totp';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cancelTwoFactorSetup } from '../actions';
import { TwoFactorSetupForm } from '../two-factor-forms';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Spaces every 4 characters — a long key typed without breaks is easy to misread. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}

export default async function TwoFactorSetupPage() {
  const user = await requireUser();
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (account?.twoFactorEnabled || !account?.twoFactorSecret) redirect('/admin/security');

  const uri = totpUri(account.email, account.twoFactorSecret);
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 240,
    color: { dark: '#1b2333', light: '#ffffff' },
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={t('security.setupTitle')}
        description={t('security.appHint')}
        backHref="/admin/security"
        backLabel={t('common.back')}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card size="sm">
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">
              1. {t('security.step1')}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={t('security.setupTitle')}
              width={240}
              height={240}
              className="size-60 rounded-lg border bg-white p-2"
            />
            <p className="text-xs text-muted-foreground">{t('security.orKey')}</p>
            <p className="select-all rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider">
              {groupSecret(account.twoFactorSecret)}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">
              2. {t('security.step2')}
            </p>
            <TwoFactorSetupForm labels={{ code: t('security.confirmCode'), submit: t('security.confirm') }} />
            <form action={cancelTwoFactorSetup}>
              <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
                <ShieldCheck />
                {t('security.cancel')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
