import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { ACTION_VERBS, pick, roleDescription, roleName, systemGroupLabel, systemPermissionLabel } from '@/lib/admin/permission-labels';
import { CONTENT_TYPES } from '@/lib/content-types';
import { CONTENT_ACTIONS, SUPER_ADMIN_ROLE_KEY, SYSTEM_PERMISSIONS } from '@/lib/rbac';
import { PageHeader } from '@/components/admin/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RolePermissionsForm, type RoleMatrix } from '@/components/admin/role-permissions-form';
import { saveRolePermissions } from '../actions';

export default async function RolePermissionsPage({ params }: { params: Promise<{ key: string }> }) {
  const viewer = await requirePermission('roles.manage');
  const locale = await getAdminLocale(viewer.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const { key } = await params;

  const role = await prisma.role.findUnique({
    where: { key },
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) notFound();

  const isSuper = role.key === SUPER_ADMIN_ROLE_KEY;
  const granted = new Set(role.permissions.map((grant) => grant.permission.key));

  const matrix: RoleMatrix = {
    columns: CONTENT_ACTIONS.map((action) => ({ action, label: pick(locale, ACTION_VERBS[action]) })),
    rows: CONTENT_TYPES.map((type) => ({
      typeKey: type.key,
      label: t(`type.${type.key}` as Parameters<typeof translate>[1]),
      cells: CONTENT_ACTIONS.map((action) => ({
        permission: `${type.key}.${action}`,
        label: '',
        checked: isSuper || granted.has(`${type.key}.${action}`),
      })),
    })),
    systemGroups: SYSTEM_PERMISSIONS.reduce<RoleMatrix['systemGroups']>((groups, permission) => {
      const existing = groups.find((group) => group.title === systemGroupLabel(permission.group, locale));
      const cell = {
        permission: permission.key,
        label: systemPermissionLabel(permission.key, locale),
        checked: isSuper || granted.has(permission.key),
      };
      if (existing) existing.items.push(cell);
      else groups.push({ title: systemGroupLabel(permission.group, locale), items: [cell] });
      return groups;
    }, []),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title={roleName(role.key, role.name, locale)}
        description={isSuper ? t('roles.fullAccess') : roleDescription(role.key, role.description, locale) || undefined}
        backHref="/admin/roles"
        backLabel={t('common.back')}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            {t('roles.users')}: {role._count?.users ?? 0}
          </span>
        }
      />

      {isSuper ? (
        <Alert>
          <ShieldCheck />
          <AlertDescription>{t('roles.readOnly')}</AlertDescription>
        </Alert>
      ) : null}

      <RolePermissionsForm
        roleKey={role.key}
        matrix={matrix}
        readOnly={isSuper}
        action={isSuper ? undefined : saveRolePermissions}
        labels={{ save: t('roles.save'), note: t('roles.sectionColumn'), saved: t('roles.saved') }}
      />
    </div>
  );
}
