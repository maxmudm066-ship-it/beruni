/**
 * The Link Checker writes: one sweep over every address the site points at itself. Everything is
 * a plain form post, so the screen works with JavaScript turned off.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import { runLinkCheck } from '@/lib/admin/link-check';

export async function checkLinks(): Promise<void> {
  const guard = await assertPermission('linkcheck.run');
  if (!guard.ok) redirect('/admin/links?notice=denied');

  const result = await runLinkCheck(guard.user.id);
  const locale: AdminLocale = localeOf(guard.user.language);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  await recordAudit({
    userId: guard.user.id,
    action: 'linkcheck.run',
    entityType: 'LinkCheckRun',
    entityId: result.runId,
    description: `${t('audit.linkCheck')} · ${result.checked} · ${t('links.problemCount')}: ${result.broken}`,
    payload: { checked: result.checked, broken: result.broken },
  });

  revalidatePath('/admin/links');
  revalidatePath('/admin');
  redirect('/admin/links?notice=done');
}
