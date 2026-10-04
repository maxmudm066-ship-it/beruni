import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { roleDescription, roleName } from '@/lib/admin/permission-labels';
import { SUPER_ADMIN_ROLE_KEY } from '@/lib/rbac';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default async function RolesPage() {
  const viewer = await requirePermission('roles.manage');
  const locale = await getAdminLocale(viewer.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const stored = await prisma.role.findMany({
    include: { _count: { select: { users: true, permissions: true } } },
  });
  // Sorted by the name a person actually reads, not by the English name stored in the database.
  const collator = new Intl.Collator(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB');
  const roles = [...stored].sort((a, b) => collator.compare(roleName(a.key, a.name, locale), roleName(b.key, b.name, locale)));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={t('nav.roles')} description={t('roles.description')} />

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => {
          const isSuper = role.key === SUPER_ADMIN_ROLE_KEY;
          return (
            <Card key={role.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {roleName(role.key, role.name, locale)}
                  {isSuper ? <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" /> : null}
                </CardTitle>
                <CardDescription>{isSuper ? t('roles.fullAccess') : roleDescription(role.key, role.description, locale)}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t('roles.users')}: <span className="font-medium text-foreground tabular-nums">{role._count.users}</span>
                  {' · '}
                  {t('roles.rights')}:{' '}
                  <span className="font-medium text-foreground tabular-nums">
                    {isSuper ? t('common.all') : role._count.permissions}
                  </span>
                </p>
                <Button asChild variant={isSuper ? 'outline' : 'default'} size="sm">
                  <Link href={`/admin/roles/${role.key}`}>
                    {isSuper ? t('common.viewAll') : t('roles.edit')}
                    <ChevronRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
