/**
 * Import / Export writes. A file is checked first and only written to the database after an
 * administrator confirms the report, so a spreadsheet that turned out to be wrong costs nothing.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/labels';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import {
  MAX_IMPORT_BYTES,
  applyImportJob,
  cancelImportJob,
  validateImportFile,
} from '@/lib/admin/import-export';

const PERMISSION = 'importexport.manage';
const SCREEN = '/admin/import-export';

function text(form: FormData, name: string, max: number): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

/** Everything comes back to this screen; the report address is rebuilt, never taken from the form. */
function backTo(params: Record<string, string | undefined>): never {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value.slice(0, 200));
  }
  const query = search.toString();
  redirect(query ? `${SCREEN}?${query}` : SCREEN);
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: TranslationKey) => translate(locale, key);
}

/** Material types are written out by their name, never by the registry key. */
function typeLabel(language: string | null, typeKey: string): string {
  return translate(localeOf(language), `type.${typeKey}` as TranslationKey);
}

export async function checkImportFile(form: FormData): Promise<void> {
  const typeKey = text(form, 'type', 40);
  const requestedLang = text(form, 'lang', 8).toLowerCase();
  const def = CONTENT_TYPE_MAP.get(typeKey);
  if (!def) backTo({ bad: 'badType' });

  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo({ notice: 'denied', type: typeKey, lang: requestedLang });

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) backTo({ bad: 'emptyFile', type: typeKey, lang: requestedLang });
  if (file.size > MAX_IMPORT_BYTES) backTo({ bad: 'tooLarge', type: typeKey, lang: requestedLang });

  const languages = await prisma.language.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  const fallback = languages.find((language) => language.code === requestedLang)?.code ?? languages[0]?.code ?? 'ru';
  const locale = localeOf(guard.user.language);
  const content = Buffer.from(await file.arrayBuffer()).toString('utf8');

  const result = await validateImportFile({
    def,
    filename: file.name,
    content,
    defaultLang: fallback,
    locale,
    userId: guard.user.id,
  });
  if ('reason' in result) backTo({ bad: result.reason, type: typeKey, lang: fallback });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'import.validate',
    entityType: 'ImportJob',
    entityId: result.jobId,
    description: `${t('audit.importChecked')} · ${file.name} · ${typeLabel(guard.user.language, def.key)} · ${t('importExport.rowsReady')}: ${result.validRows}`,
    payload: { filename: file.name, totalRows: result.totalRows, validRows: result.validRows },
  });

  revalidatePath(SCREEN);
  backTo({ job: result.jobId, notice: 'checked', type: typeKey, lang: fallback });
}

export async function confirmImport(form: FormData): Promise<void> {
  const jobId = text(form, 'job', 40);
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo({ notice: 'denied' });

  const job = jobId
    ? await prisma.importJob.findUnique({
        where: { id: jobId },
        select: { id: true, status: true, contentType: true, filename: true, validRows: true },
      })
    : null;
  if (!job) backTo({ notice: 'missing' });
  if (job.status !== 'validated') backTo({ notice: 'notReady', job: job.id, type: job.contentType });

  const t = auditFor(guard.user.language);
  const result = await applyImportJob(job.id, {
    id: guard.user.id,
    locale: localeOf(guard.user.language),
    revisionLabel: t('importExport.revision'),
  });
  if ('reason' in result) backTo({ bad: result.reason, type: job.contentType });

  await recordAudit({
    userId: guard.user.id,
    action: 'import.apply',
    entityType: 'ImportJob',
    entityId: job.id,
    description: `${t('audit.importDone')} · ${job.filename} · ${typeLabel(guard.user.language, job.contentType)} · ${t('importExport.createdCount')}: ${result.created}`,
    payload: result,
  });

  revalidatePath('/', 'layout');
  backTo({ job: job.id, notice: 'imported', type: job.contentType });
}

export async function discardImport(form: FormData): Promise<void> {
  const jobId = text(form, 'job', 40);
  const guard = await assertPermission(PERMISSION);
  if (!guard.ok) backTo({ notice: 'denied' });

  const job = jobId
    ? await prisma.importJob.findUnique({ where: { id: jobId }, select: { id: true, contentType: true, filename: true } })
    : null;
  if (!job) backTo({ notice: 'missing' });

  const cancelled = await cancelImportJob(job.id);
  if (!cancelled) backTo({ notice: 'notReady', job: job.id, type: job.contentType });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'import.cancel',
    entityType: 'ImportJob',
    entityId: job.id,
    description: `${t('audit.importCancelled')} · ${job.filename} · ${typeLabel(guard.user.language, job.contentType)}`,
  });

  revalidatePath(SCREEN);
  backTo({ notice: 'cancelled', type: job.contentType });
}
