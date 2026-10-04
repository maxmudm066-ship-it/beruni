/**
 * Site settings writes. Each group on the screen is its own plain form, so saving the contact
 * details never touches the media limits, and nothing here needs JavaScript.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import { SETTING_GROUPS, settingsOfGroup, type SettingGroup } from '@/lib/admin/settings-catalog';
import type { SettingRejection } from '@/lib/settings';
import { applySettingsForm, getSiteSetting } from '@/lib/settings';

const PERMISSION = 'settings.manage';
const SCREEN = '/admin/settings';

function text(form: FormData, name: string, max: number): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

/** Settings always return to their own screen, so a crafted `back` field is simply ignored. */
function done(notice?: string): never {
  redirect(notice ? `${SCREEN}?${notice}` : SCREEN);
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: Parameters<typeof translate>[1]) => translate(locale, key);
}

/** `general.max_upload_mb:number,seo.og_image:option` — names what was refused, nothing else. */
function badList(rejected: SettingRejection[]): string {
  return rejected.map(({ field, problem }) => `${field.group}.${field.key}:${problem}`).join(',');
}

function noticeQuery(rejected: SettingRejection[], saved: number): string {
  if (!rejected.length) return 'notice=saved';
  return `notice=${saved ? 'partial' : 'failed'}&bad=${badList(rejected)}`;
}

export async function saveSettingsGroup(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) done('notice=denied');

  const raw = text(form, 'group', 20);
  const group = (SETTING_GROUPS as readonly string[]).includes(raw) ? (raw as SettingGroup) : null;
  if (!group) done();

  // The technical group is only editable with its own permission, whatever the form claims.
  const technical = guard.user.permissions.includes('*') || guard.user.permissions.includes('settings.security');
  const fields = settingsOfGroup(group, technical ? 'technical' : 'staff');
  if (!fields.length) done();

  const [languages, defaultLang] = await Promise.all([
    prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { code: true } }),
    getSiteSetting('general', 'default_language'),
  ]);

  const result = await applySettingsForm(
    form,
    fields,
    languages,
    languages.some((language) => language.code === defaultLang) ? defaultLang : (languages[0]?.code ?? 'ru'),
  );

  if (result.saved.length) {
    // Header, footer, contacts and page titles are built from these values.
    revalidatePath('/', 'layout');
    const t = auditFor(guard.user.language);
    await recordAudit({
      userId: guard.user.id,
      action: 'settings.update',
      entityType: 'Setting',
      entityId: null,
      description: `${t('audit.settings')} · ${group}: ${result.saved.map((field) => field.key).join(', ').slice(0, 240)}`,
    });
  }

  done(noticeQuery(result.rejected, result.saved.length));
}
