import { authorize, fail, isErrorResponse, json } from '@/lib/api/guard';
import { recordAudit } from '@/lib/auth/audit';
import { actorLocale, interpolate, localeOf, translate } from '@/lib/admin/i18n';
import { prisma } from '@/lib/db';
import { folderPaths, toPickedMedia } from '@/lib/media/serialize';
import { MediaUploadError, purgeMedia, replaceUpload } from '@/lib/media/upload';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/media/[id] — ALT text, title, caption and folder. The file itself is untouched. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await authorize('media.edit', request);
  if (isErrorResponse(user)) return user;

  const { id } = await params;
  const locale = await actorLocale(user.language);
  const body = (await request.json().catch(() => ({}))) as {
    altText?: string | null;
    title?: string | null;
    caption?: string | null;
    description?: string | null;
    folderId?: string | null;
  };

  const existing = await prisma.media.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail(404, translate(locale, 'error.mediaGone'));

  // An explicit null (or the empty string the folder select sends for "no folder") means
  // "move out of any folder", so the presence of the key is what decides whether we touch it.
  const wantsFolder = 'folderId' in body;
  const folderId = body.folderId || null;
  if (folderId) {
    const exists = await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } });
    if (!exists) return fail(400, translate(locale, 'error.unknownFolder'));
  }

  const media = await prisma.media.update({
    where: { id },
    data: {
      ...(body.altText !== undefined ? { altText: body.altText?.trim() || null } : {}),
      ...(body.title !== undefined ? { title: body.title?.trim() || null } : {}),
      ...(body.caption !== undefined ? { caption: body.caption?.trim() || null } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(wantsFolder ? { folderId } : {}),
    },
    include: { variants: true, _count: { select: { links: true } } },
  });

  await recordAudit({
    userId: user.id,
    action: 'media.edit',
    entityType: 'Media',
    entityId: id,
    description: `${translate(localeOf(user.language), 'audit.mediaEdited')} · ${media.originalName}`,
    payload: Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined)),
  });

  const paths = await folderPaths();
  return json({ ok: true, media: toPickedMedia(media, media.folderId ? (paths.get(media.folderId) ?? null) : null, media._count.links) });
}

/** POST /api/admin/media/[id] — replaces the stored bytes while keeping the same public URL. */
export async function POST(request: Request, { params }: Params) {
  const user = await authorize('media.upload', request);
  if (isErrorResponse(user)) return user;

  const { id } = await params;
  const locale = await actorLocale(user.language);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, translate(locale, 'error.badUploadRequest'));
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, translate(locale, 'error.noFileReceived'));

  try {
    const media = await replaceUpload(id, {
      originalName: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    });

    await recordAudit({
      userId: user.id,
      action: 'media.replace',
      entityType: 'Media',
      entityId: id,
      description: `${translate(localeOf(user.language), 'audit.mediaReplaced')} · ${media.originalName} → ${file.name}`,
      payload: { sizeBytes: media.sizeBytes, replacedCount: media.replacedCount },
    });

    const paths = await folderPaths();
    return json({ ok: true, media: toPickedMedia(media, media.folderId ? (paths.get(media.folderId) ?? null) : null, media._count.links) });
  } catch (error) {
    if (error instanceof MediaUploadError) return fail(400, interpolate(locale, error.key, error.params));
    console.error('media replace failed', error);
    return fail(500, translate(locale, 'error.replaceFailed'));
  }
}

/** DELETE /api/admin/media/[id]?force=1 — refuses while materials still link the file. */
export async function DELETE(request: Request, { params }: Params) {
  const user = await authorize('media.delete', request);
  if (isErrorResponse(user)) return user;

  const { id } = await params;
  const locale = await actorLocale(user.language);
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';

  const media = await prisma.media.findUnique({ where: { id }, select: { id: true, originalName: true, _count: { select: { links: true } } } });
  if (!media) return fail(404, translate(locale, 'error.mediaGone'));

  const usedIn = media._count.links;
  if (usedIn > 0 && !force) {
    return fail(409, interpolate(locale, 'error.mediaInUse', { count: usedIn }), { usedIn });
  }

  const t = (key: Parameters<typeof translate>[1]) => translate(localeOf(user.language), key);
  await purgeMedia(id);
  await recordAudit({
    userId: user.id,
    action: 'media.delete',
    entityType: 'Media',
    entityId: id,
    description: `${t('audit.mediaDeleted')} · ${media.originalName}${usedIn ? ` · ${t('audit.mediaUsedIn')}: ${usedIn}` : ''}`,
  });

  return json({ ok: true });
}
