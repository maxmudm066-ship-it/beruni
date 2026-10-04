/**
 * Redirect Manager writes. A redirect is one old address and one new address, and every screen
 * here is a plain form post, so it keeps working with JavaScript turned off.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { assertPermission } from '@/lib/auth/session';
import { recordAudit } from '@/lib/auth/audit';
import { localeOf, translate, type AdminLocale } from '@/lib/admin/labels';
import {
  REDIRECT_NOTE_MAX,
  REDIRECT_SOURCE_MAX,
  REDIRECT_TARGET_MAX,
  readRedirectPaths,
  redirectType,
  type RedirectProblem,
} from '@/lib/admin/redirect-path';

const PERMISSION = 'redirects.manage';
const SCREEN = '/admin/redirects';

function text(form: FormData, name: string, max: number): string {
  const raw = form.get(name);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

function flag(form: FormData, name: string): boolean {
  const raw = form.get(name);
  return raw === 'on' || raw === 'true' || raw === '1';
}

/** Only a Redirects URL may be returned to, so a crafted form cannot redirect off the screen. */
function backTo(form: FormData, notice: string): never {
  const raw = form.get('back');
  const path = typeof raw === 'string' && raw.startsWith(SCREEN) ? raw.slice(0, 300) : SCREEN;
  redirect(`${path}${path.includes('?') ? '&' : '?'}${notice}`);
}

/**
 * The typed addresses travel back in the address bar so a refused value is not lost. The screen
 * shows them only as a value in the form, never as a link, and checks them again on the next save.
 */
function draftQuery(form: FormData, problem: RedirectProblem, editingId: string): string {
  const params = new URLSearchParams();
  params.set('bad', problem);
  const source = text(form, 'source', REDIRECT_SOURCE_MAX);
  const target = text(form, 'target', REDIRECT_TARGET_MAX);
  if (source) params.set('d_source', source);
  if (target) params.set('d_target', target);
  params.set('d_type', redirectType(typeof form.get('type') === 'string' ? form.get('type') as string : null));
  const note = text(form, 'note', REDIRECT_NOTE_MAX);
  if (note) params.set('d_note', note);
  if (editingId) params.set('edit', editingId);
  return params.toString();
}

function auditFor(language: string | null) {
  const locale: AdminLocale = localeOf(language);
  return (key: Parameters<typeof translate>[1]) => translate(locale, key);
}

async function pairTaken(sourcePath: string, exceptId: string | null): Promise<boolean> {
  const other = await prisma.redirect.findFirst({
    where: { sourcePath, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return Boolean(other);
}

export async function saveRedirect(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, 'notice=denied');

  const paths = readRedirectPaths(
    text(form, 'source', REDIRECT_SOURCE_MAX),
    text(form, 'target', REDIRECT_TARGET_MAX),
  );
  if (!paths.ok) backTo(form, draftQuery(form, paths.problem, id));

  const type = redirectType(typeof form.get('type') === 'string' ? (form.get('type') as string) : null);
  const note = text(form, 'note', REDIRECT_NOTE_MAX) || null;
  if (await pairTaken(paths.sourcePath, id || null)) backTo(form, 'notice=exists');
  const t = auditFor(guard.user.language);

  if (id) {
    const existing = await prisma.redirect.findUnique({ where: { id }, select: { id: true } });
    if (!existing) backTo(form, 'notice=missing');

    await prisma.redirect.update({
      where: { id },
      data: {
        sourcePath: paths.sourcePath,
        targetPath: paths.targetPath,
        redirectType: type,
        note,
        isActive: flag(form, 'isActive'),
      },
    });
    await recordAudit({
      userId: guard.user.id,
      action: 'redirect.update',
      entityType: 'Redirect',
      entityId: id,
      description: `${t('audit.redirectSaved')} · ${paths.sourcePath} → ${paths.targetPath}`,
      payload: { type, isActive: flag(form, 'isActive') },
    });
    revalidatePath('/', 'layout');
    backTo(form, 'notice=saved');
  }

  const created = await prisma.redirect.create({
    data: {
      sourcePath: paths.sourcePath,
      targetPath: paths.targetPath,
      redirectType: type,
      note,
      origin: 'manual',
      isActive: true,
    },
  });
  await recordAudit({
    userId: guard.user.id,
    action: 'redirect.create',
    entityType: 'Redirect',
    entityId: created.id,
    description: `${t('audit.redirectCreated')} · ${created.sourcePath} → ${created.targetPath}`,
    payload: { type },
  });
  revalidatePath('/', 'layout');
  backTo(form, 'notice=created');
}

/** Switches one redirect on or off without touching its addresses. */
export async function setRedirectActive(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  const raw = form.get('active');
  const active = raw === '1' || raw === '0';
  if (!guard.ok || !id || !active) backTo(form, 'notice=denied');

  const redirect_ = await prisma.redirect.findUnique({ where: { id }, select: { id: true, sourcePath: true } });
  if (!redirect_) backTo(form, 'notice=missing');

  const isActive = raw === '1';
  await prisma.redirect.update({ where: { id }, data: { isActive } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'redirect.update',
    entityType: 'Redirect',
    entityId: id,
    description: `${t('audit.redirect')} · ${redirect_.sourcePath} · ${t(isActive ? 'redirects.on' : 'redirects.off')}`,
    payload: { isActive },
  });
  revalidatePath('/', 'layout');
  backTo(form, 'notice=state');
}

export async function deleteRedirect(form: FormData): Promise<void> {
  const guard = await assertPermission(PERMISSION);
  const id = text(form, 'id', 40);
  if (!guard.ok) backTo(form, 'notice=denied');

  const row = await prisma.redirect.findUnique({ where: { id }, select: { id: true, sourcePath: true } });
  if (!row) backTo(form, 'notice=missing');

  await prisma.redirect.delete({ where: { id } });

  const t = auditFor(guard.user.language);
  await recordAudit({
    userId: guard.user.id,
    action: 'redirect.delete',
    entityType: 'Redirect',
    entityId: id,
    description: `${t('audit.redirectDeleted')} · ${row.sourcePath}`,
  });
  revalidatePath('/', 'layout');
  backTo(form, 'notice=deleted');
}
