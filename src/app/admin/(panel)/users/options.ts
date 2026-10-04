import 'server-only';
import { prisma } from '@/lib/db';
import { ADMIN_LANGUAGE_NAMES, ADMIN_LOCALES, translate, type AdminLocale } from '@/lib/admin/i18n';
import { roleName } from '@/lib/admin/permission-labels';

const ACCESS_STATUSES = ['active', 'invited', 'suspended'] as const;

export async function staffFormOptions(locale: AdminLocale) {
  const stored = await prisma.role.findMany({ select: { id: true, key: true, name: true } });
  // The picker shows the name a person reads, in the order of those names.
  const roles = stored
    .map((role) => ({ id: role.id, name: roleName(role.key, role.name, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB'));

  return {
    roles,
    languages: ADMIN_LOCALES.map((code) => ({ code, name: ADMIN_LANGUAGE_NAMES[code] })),
    statuses: ACCESS_STATUSES.map((value) => ({ value, label: translate(locale, `access.${value}`) })),
    labels: {
      displayName: translate(locale, 'users.displayName'),
      email: translate(locale, 'users.email'),
      username: translate(locale, 'users.username'),
      usernameHint: translate(locale, 'users.usernameHint'),
      role: translate(locale, 'users.role'),
      language: translate(locale, 'users.language'),
      status: translate(locale, 'users.status'),
      tempPassword: translate(locale, 'users.tempPassword'),
      tempPasswordHint: translate(locale, 'users.tempPasswordHint'),
      save: translate(locale, 'users.save'),
      cancel: translate(locale, 'common.cancel'),
    },
  };
}
