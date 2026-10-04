/**
 * Every request to the old site goes through here, so politeness cannot be forgotten by a caller.
 *
 * `beruni.uz` answers 403 to anything that does not look like a browser and has never answered
 * faster than we asked: the delay below is what kept a probe of 25 requests clean. Retries back off
 * instead of hammering, because the old site is the only copy of the content until the import is
 * finished — a blocked address would be worse than a slow crawl.
 */

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const DEFAULT_DELAY_MS = 2500;
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface PageResult {
  url: string;
  status: number;
  body: string;
  contentType: string;
  bytes: number;
  /** True when the address answered 404 — recorded so the report can separate dead links from unvisited ones. */
  dead: boolean;
}

export class BlockedError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`beruni.uz answered ${status} for ${url}`);
    this.name = 'BlockedError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A URL as it must appear on the wire: the site writes Cyrillic and U+2018 into hrefs unencoded. */
export function encodeUrl(absolute: string): string {
  try {
    return encodeURI(decodeURI(absolute));
  } catch {
    return encodeURI(absolute);
  }
}

let lastRequestAt = 0;

export interface FetchOptions {
  delayMs?: number;
  timeoutMs?: number;
  attempts?: number;
}

/** Waits out the polite interval, then fetches a page as text. Throws when the host stays unreachable. */
export async function fetchPage(absoluteUrl: string, options: FetchOptions = {}): Promise<PageResult> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const attempts = options.attempts ?? 4;
  const url = encodeUrl(absoluteUrl);
  let lastFailure = 'unknown';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const wait = lastRequestAt + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'ru-ru,ru;q=0.9,uz;q=0.8,en;q=0.7',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });

      if (response.status === 403) throw new BlockedError(403, url);
      if (response.status === 429 || response.status >= 500) {
        lastFailure = `status ${response.status}`;
        await sleep(delayMs * (attempt + 2));
        continue;
      }

      const body = await response.text();
      return {
        url,
        status: response.status,
        body,
        contentType: response.headers.get('content-type') ?? '',
        bytes: Buffer.byteLength(body),
        dead: response.status === 404,
      };
    } catch (error) {
      if (error instanceof BlockedError) throw error;
      lastFailure = error instanceof Error ? error.message : String(error);
      await sleep(delayMs * (attempt + 2));
    }
  }

  throw new Error(`${url} stayed unreachable (${lastFailure})`);
}

/** The same courtesy for a binary file: size-capped, since the disk holding the archive is not large. */
export async function fetchBytes(
  absoluteUrl: string,
  maxBytes: number,
  options: FetchOptions = {},
): Promise<{ url: string; status: number; data: Buffer; contentType: string }> {
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const url = encodeUrl(absoluteUrl);

  const wait = lastRequestAt + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS * 4),
  });
  if (!response.ok) return { url, status: response.status, data: Buffer.alloc(0), contentType: '' };

  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) return { url, status: 413, data: Buffer.alloc(0), contentType: response.headers.get('content-type') ?? '' };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) return { url, status: 413, data: Buffer.alloc(0), contentType: '' };
  return { url, status: response.status, data: buffer, contentType: response.headers.get('content-type') ?? '' };
}
