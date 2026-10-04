import { actorLocale, interpolate, type TranslationKey } from '@/lib/admin/i18n';
import { authorize, fail, isErrorResponse, json } from '@/lib/api/guard';
import { prisma } from '@/lib/db';
import { folderPaths } from '@/lib/media/serialize';

export const runtime = 'nodejs';

/** GET /api/admin/media/folders — folder tree flattened to "Parent/Child" paths. */
export async function GET(request: Request) {
  const user = await authorize('media.view', request);
  if (isErrorResponse(user)) return user;

  const [folders, paths] = await Promise.all([
    prisma.mediaFolder.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, parentId: true } }),
    folderPaths(),
  ]);

  return json({
    folders: folders.map((folder) => ({ ...folder, path: paths.get(folder.id) ?? folder.name })),
  });
}

/** POST /api/admin/media/folders — create a folder, optionally nested. */
export async function POST(request: Request) {
  const user = await authorize('media.edit', request);
  if (isErrorResponse(user)) return user;

  const body = (await request.json().catch(() => ({}))) as { name?: string; parentId?: string | null };
  const locale = await actorLocale(user.language);
  const t = (key: TranslationKey, params?: Record<string, string | number>) => interpolate(locale, key, params);

  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name) return fail(400, t('error.folderNeedsName'));

  const parentId = body.parentId || null;
  if (parentId && !(await prisma.mediaFolder.findUnique({ where: { id: parentId }, select: { id: true } }))) {
    return fail(400, t('error.unknownParentFolder'));
  }

  // The unique index cannot cover a missing parent, so SQLite lets two root folders share a name.
  // Without this check the panel would show two identical entries and nobody would know which is real.
  if (await prisma.mediaFolder.findFirst({ where: { name, parentId }, select: { id: true } })) {
    return fail(409, t('error.folderExists'));
  }

  try {
    const folder = await prisma.mediaFolder.create({ data: { name, parentId } });
    return json({ ok: true, folder }, { status: 201 });
  } catch {
    return fail(409, t('error.folderExists'));
  }
}
