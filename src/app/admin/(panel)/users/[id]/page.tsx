import { notFound } from 'next/navigation';
import { KeyRound, LockOpen, ShieldOff } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { roleName } from '@/lib/admin/permission-labels';
import { formatDateTime } from '@/lib/admin/format';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { updateUser, resetUserPassword, resetTwoFactor, unlockAccount } from '../actions';
import { staffFormOptions } from '../options';
import { UserForm } from '../user-form';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermission('users.manage');
  const locale = await getAdminLocale(viewer.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { id } = await params;

  const target = await prisma.user.findUnique({
    where: { id },
    include: { role: { select: { key: true, name: true } } },
  });
  if (!target) notFound();

  const options = await staffFormOptions(locale);
  const locked = target.lockedUntil !== null && target.lockedUntil > new Date();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title={target.displayName}
        description={`${target.email} · ${roleName(target.role.key, target.role.name, locale)}`}
        backHref="/admin/users"
        backLabel={t('common.back')}
        actions={
          <span className="text-xs text-muted-foreground">
            {t('users.lastLogin')}: {target.lastLoginAt ? formatDateTime(target.lastLoginAt, locale) : t('users.never')}
          </span>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('users.name')}</CardTitle>
        </CardHeader>
        <CardContent>
          <UserForm
            action={updateUser}
            userId={target.id}
            showStatus={target.id !== viewer.id}
            values={{
              displayName: target.displayName,
              email: target.email,
              username: target.username,
              roleId: target.roleId,
              language: target.language,
              status: target.status,
            }}
            roles={options.roles}
            languages={options.languages}
            statuses={options.statuses}
            labels={options.labels}
          />
        </CardContent>
      </Card>

      {target.id === viewer.id ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('users.selfEdit')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('users.danger')}</CardTitle>
            <CardDescription>{t('users.tempPasswordHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form action={resetUserPassword} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="userId" value={target.id} />
              <div className="min-w-56 flex-1 space-y-2">
                <Label htmlFor="reset-password">{t('users.newPassword')}</Label>
                <Input id="reset-password" name="password" type="text" minLength={10} required />
              </div>
              <Button type="submit" variant="outline">
                <KeyRound />
                {t('users.resetPassword')}
              </Button>
            </form>

            <div className="flex flex-wrap gap-3">
              {locked ? (
                <form action={unlockAccount}>
                  <input type="hidden" name="userId" value={target.id} />
                  <Button type="submit" variant="outline">
                    <LockOpen />
                    {t('users.unlock')}
                  </Button>
                </form>
              ) : null}

              {target.twoFactorEnabled ? (
                <form action={resetTwoFactor}>
                  <input type="hidden" name="userId" value={target.id} />
                  <Button type="submit" variant="outline">
                    <ShieldOff />
                    {t('users.reset2fa')}
                  </Button>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
