import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { absolutePath, extensionOf, mimeTypeFor } from '@/lib/media/storage';

export const runtime = 'nodejs';

const CHUNK = 1024 * 1024;

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'X-Content-Type-Options': 'nosniff' } });
}

/**
 * Streams an uploaded file. Only extensions the Media Library can store are served, so a
 * stray .html or .js in the upload directory can never be executed by the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const segments = (await params).path ?? [];
  const relative = segments.join('/');
  const target = absolutePath(relative);
  if (!target) return notFound();

  const extension = extensionOf(target);
  if (!extension) return notFound();
  const mime = mimeTypeFor(extension);

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return notFound();
  }
  if (!stat.isFile()) return notFound();

  const headers = new Headers({
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    // A replaced file keeps its URL, so the cache lifetime stays short and revalidation is
    // handled by ETag/Last-Modified instead of an immutable marker.
    'Cache-Control': 'public, max-age=86400',
    ETag: `"${stat.size}-${Math.floor(stat.mtimeMs)}"`,
    'Last-Modified': stat.mtime.toUTCString(),
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });

  if (new URL(request.url).searchParams.get('download') === '1') {
    const filename = path.basename(target).replace(/[^\w.\-]+/g, '_');
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
  } else if (mime.startsWith('video/') || mime.startsWith('audio/')) {
    headers.set('Content-Disposition', 'inline');
  }

  const range = request.headers.get('range');
  if (range) {
    const matched = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (matched) {
      const start = matched[1] ? Number.parseInt(matched[1], 10) : 0;
      const end = matched[2] ? Math.min(Number.parseInt(matched[2], 10), stat.size - 1) : stat.size - 1;
      if (start < stat.size && end >= start) {
        headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Content-Length', String(end - start + 1));
        return new Response(Readable.toWeb(createReadStream(target, { start, end })) as ReadableStream, {
          status: 206,
          headers,
        });
      }
    }
    headers.set('Content-Range', `bytes */${stat.size}`);
    return new Response(null, { status: 416, headers });
  }

  if (request.headers.get('if-none-match') === headers.get('ETag')) return new Response(null, { status: 304, headers });

  headers.set('Content-Length', String(stat.size));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(Readable.toWeb(createReadStream(target, { highWaterMark: CHUNK })) as ReadableStream, { headers });
}
