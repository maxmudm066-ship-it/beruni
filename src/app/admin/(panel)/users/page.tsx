import Link from 'next/link';
import { Search, ShieldCheck, UserPlus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { roleName } from '@/lib/admin/permission-labels';
import { formatRelative } from '@/lib/admin/format';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ACCESS_LABEL = {
  active: 'access.active',
  invited: 'access.invited',
  suspended: 'access.suspended',
} as const;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requirePermission('users.manage');
  const locale = await getAdminLocale(viewer.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { q } = await searchParams;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { displayName: { contains: q } },
            { email: { contains: q } },
            { username: { contains: q } },
          ],
        }
      : {},
    include: { role: true },
    orderBy: [{ displayName: 'asc' }],
  });

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title={t('nav.users')}
        description={t('users.description')}
        actions={
          <Button asChild size="sm">
            <Link href="/admin/users/new">
              <UserPlus />
              {t('users.add')}
            </Link>
          </Button>
        }
      />

      <form className="mb-4 flex max-w-sm items-center gap-2" method="get">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q ?? ''} placeholder={t('users.search')} className="pl-8" />
        </div>
        <Button variant="outline" size="sm" type="submit">
          {t('common.search')}
        </Button>
      </form>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.name')}</TableHead>
                <TableHead>{t('users.role')}</TableHead>
                <TableHead>{t('users.status')}</TableHead>
                <TableHead>{t('users.lastLogin')}</TableHead>
                <TableHead>{t('users.twoFactor')}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        <AvatarFallback className="text-[11px]">{initials(row.displayName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{roleName(row.role.key, row.role.name, locale)}</TableCell>
                  <TableCell>
                    <StatusPill
                      status={row.status}
                      label={t(ACCESS_LABEL[row.status as keyof typeof ACCESS_LABEL] ?? 'access.active')}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.lastLoginAt ? formatRelative(row.lastLoginAt, locale) : t('users.never')}
                    {row.lockedUntil && row.lockedUntil > new Date() ? (
                      <span className="mt-0.5 block text-xs text-destructive">
                        {t('users.locked')} {formatRelative(row.lockedUntil, locale)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {row.twoFactorEnabled ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="size-3.5" />
                        {t('common.on')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('common.off')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/users/${row.id}`}>{t('users.edit')}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}

              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t('users.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
