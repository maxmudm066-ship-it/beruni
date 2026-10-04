'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { ALL_PERMISSIONS, SUPER_ADMIN_ROLE_KEY } from '@/lib/rbac';
import { actorLocale } from '@/lib/admin/i18n';
import { translate, type TranslationKey } from '@/lib/admin/labels';
import { roleName } from '@/lib/admin/permission-labels';
import type { ActionState } from '@/lib/admin/action-state';

const ROLE_PERMISSION = 'roles.manage';
const VALID_KEYS = new Set(ALL_PERMISSIONS.map((permission) => permission.key));

export async function saveRolePermissions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const guard = await assertPermission(ROLE_PERMISSION);
  if (!guard.ok) return { error: guard.error };

  const locale = await actorLocale(guard.user.language);
  const t = (key: TranslationKey) => translate(locale, key);

  const roleKey = String(formData.get('roleKey') ?? '');
  const role = await prisma.role.findUnique({
    where: { key: roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) return { error: t('error.roleNotFound') };
  if (role.key === SUPER_ADMIN_ROLE_KEY) return { error: t('error.superAdminRoleLocked') };

  const wanted = new Set(formData.getAll('permissions').map(String));
  if ([...wanted].some((key) => !VALID_KEYS.has(key))) return { error: t('error.unknownPermission') };

  const current = new Set(role.permissions.map((grant) => grant.permission.key));
  const removedIds = role.permissions.filter((grant) => !wanted.has(grant.permission.key)).map((grant) => grant.permissionId);
  const additions = await prisma.permission.findMany({
    where: { key: { in: [...wanted].filter((key) => !current.has(key)) } },
    select: { id: true },
  });

  if (removedIds.length === 0 && additions.length === 0) return { ok: t('roles.saved') };

  await prisma.$transaction([
    ...(removedIds.length
      ? [prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: removedIds } } })]
      : []),
    ...(additions.length
      ? [
          prisma.rolePermission.createMany({
            data: additions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          }),
        ]
      : []),
  ]);

  await recordAudit({
    userId: guard.user.id,
    action: 'role.permissions.update',
    entityType: 'role',
    entityId: role.id,
    description: `${translate(locale, 'audit.rolePermissions')} · ${roleName(role.key, role.name, locale)}`,
    payload: { added: additions.length, removed: removedIds.length },
  });

  revalidatePath('/admin/roles');
  revalidatePath(`/admin/roles/${role.key}`);
  return { ok: t('roles.saved') };
}
