import { NextResponse } from 'next/server';
import { assertPermission } from '@/lib/auth/session';
import { getAdminLocale, localeOf, type AdminLocale } from '@/lib/admin/i18n';
import { CONTENT_TYPE_MAP } from '@/lib/content-types';
import { buildExportFile, type ExportSubset } from '@/lib/admin/import-export';
import { redirectTo } from '@/lib/http/redirect-to';

const SUBSETS: Record<string, ExportSubset> = {
  published: 'published',
  unpublished: 'unpublished',
  all: 'all',
};

/**
 * The file an administrator downloads. A GET with no side effects, so the download can be an
 * ordinary link; a file the panel cannot build comes back to the screen with the reason.
 */
export async function GET(request: Request) {
  const guard = await assertPermission('importexport.manage');
  if (!guard.ok) return redirectTo('/admin/no-access');

  const params = new URL(request.url).searchParams;
  const typeKey = (params.get('type') ?? '').trim().slice(0, 40);
  const known = CONTENT_TYPE_MAP.has(typeKey);
  if (!known) {
    return redirectTo('/admin/import-export?bad=badType');
  }

  const locale: AdminLocale = await getAdminLocale(localeOf(guard.user.language));
  const lang = (params.get('lang') ?? 'all').trim().slice(0, 8);
  const subset = SUBSETS[params.get('subset') ?? ''] ?? 'published';
  const headersOnly = params.get('template') === '1';

  const file = await buildExportFile({ typeKey, lang, subset, locale, headersOnly });
  if ('reason' in file) {
    const query = new URLSearchParams({ bad: file.reason, type: typeKey });
    return redirectTo(`/admin/import-export?${query.toString()}`);
  }

  return new NextResponse(file.content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
