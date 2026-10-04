import { Prisma } from '@/generated/prisma/client';
import { authorize, fail, isErrorResponse, json } from '@/lib/api/guard';
import { recordAudit } from '@/lib/auth/audit';
import { actorLocale, interpolate, localeOf, translate } from '@/lib/admin/i18n';
import { prisma } from '@/lib/db';
import { MEDIA_KIND } from '@/lib/enums';
import { folderPaths, toPickedMedia } from '@/lib/media/serialize';
import { MediaUploadError, storeUpload } from '@/lib/media/upload';

export const runtime = 'nodejs';

const KINDS: readonly string[] = Object.values(MEDIA_KIND);
const PAGE_MAX = 120;

/** GET /api/admin/media — grid data for the Media Library screen and the picker dialog. */
export async function GET(request: Request) {
  const user = await authorize('media.view', request);
  if (isErrorResponse(user)) return user;

  const params = new URL(request.url).searchParams;
  const search = params.get('q')?.trim() ?? '';
  const kind = params.get('kind') ?? '';
  const folderId = params.get('folderId') || null;
  const status = params.get('status') ?? '';
  const statuses = ['processing', 'ready', 'failed'];
  const skip = Math.max(0, Number.parseInt(params.get('skip') ?? '0', 10) || 0);
  const take = Math.min(PAGE_MAX, Math.max(1, Number.parseInt(params.get('take') ?? '60', 10) || 60));

  const where: Prisma.MediaWhereInput = {
    ...(KINDS.includes(kind) ? { kind } : {}),
    ...(folderId === 'none' ? { folderId: null } : folderId ? { folderId } : {}),
    ...(statuses.includes(status) ? { status } : {}),
    ...(search
      ? {
          OR: [
            { originalName: { contains: search } },
            { filename: { contains: search } },
            { altText: { contains: search } },
            { caption: { contains: search } },
            { title: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total, paths, grouped, failed] = await Promise.all([
    prisma.media.findMany({
      where,
      include: { variants: true, _count: { select: { links: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.media.count({ where }),
    folderPaths(),
    prisma.media.groupBy({ by: ['kind'], _count: { _all: true } }),
    prisma.media.count({ where: { status: 'failed' } }),
  ]);

  const counts = Object.fromEntries(KINDS.map((key) => [key, 0])) as Record<string, number>;
  let all = 0;
  for (const group of grouped) {
    counts[group.kind] = group._count._all;
    all += group._count._all;
  }

  return json({
    items: rows.map((row) => toPickedMedia(row, row.folderId ? (paths.get(row.folderId) ?? null) : null, row._count.links)),
    total,
    skip,
    take,
    counts: { all, failed, ...counts },
  });
}

/** POST /api/admin/media — multipart upload; validated, optimised and stored on disk. */
export async function POST(request: Request) {
  const user = await authorize('media.upload', request);
  if (isErrorResponse(user)) return user;

  const locale = await actorLocale(user.language);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, translate(locale, 'error.badUploadRequest'));
  }

  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, translate(locale, 'error.noFileReceived'));

  const folderId = String(form.get('folderId') ?? '') || null;
  if (folderId) {
    const exists = await prisma.mediaFolder.findUnique({ where: { id: folderId }, select: { id: true } });
    if (!exists) return fail(400, translate(locale, 'error.unknownFolder'));
  }

  try {
    const media = await storeUpload({
      originalName: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
      folderId,
      altText: String(form.get('altText') ?? '') || null,
      title: String(form.get('title') ?? '') || null,
      caption: String(form.get('caption') ?? '') || null,
      userId: user.id,
    });

    await recordAudit({
      userId: user.id,
      action: 'media.upload',
      entityType: 'Media',
      entityId: media.id,
      description: `${translate(localeOf(user.language), 'audit.mediaUploaded')} · ${media.originalName}`,
      payload: { sizeBytes: media.sizeBytes },
    });

    const paths = await folderPaths();
    return json(
      { ok: true, media: toPickedMedia(media, media.folderId ? (paths.get(media.folderId) ?? null) : null, media._count.links) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MediaUploadError) return fail(400, interpolate(locale, error.key, error.params));
    console.error('media upload failed', error);
    return fail(500, translate(locale, 'error.uploadServerFailed'));
  }
}
