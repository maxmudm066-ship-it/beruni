/**
 * Reading an address of the old site: what language it belongs to, what kind of page it is, and which
 * pages a fetched HTML document points at.
 *
 * `beruni.uz` has no sitemap (`/sitemap.xml` answers 404) and its URL space is Joomla SEF, so the only
 * map of the site is the links itself. Normalising here — dropping fragments, keeping only the query
 * parameters that change the page, folding `/index.php/...` onto the same address — is what stops the
 * crawl from fetching one article twelve times because a menu, a category list and a slider each wrote
 * the href differently.
 */

export const SITE_HOST = 'beruni.uz';

/** The old site serves Uzbek under `en-ca`: Joomla's menu alias, not a language that exists. */
const LANG_BY_PREFIX: Record<string, string> = { 'en-ca': 'uz', ru: 'ru', en: 'en', uz: 'uz' };

/** Only these query parameters make a different page; the rest are analytics or view chrome. */
const KEEP_QUERY = ['start', 'limit', 'format', 'type'];

/** Files that carry content (PDFs, images, archives) rather than being pages. */
const ASSET_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf', 'zip', 'rar', '7z',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'mp4', 'avi', 'mov',
];

/** Theme plumbing: needed to draw the old page, of no interest to the import. */
const THEME_DIRECTORIES = ['/templates/', '/modules/', '/plugins/', '/libraries/', '/includes/', '/administrator/', '/components/'];

/**
 * Where the old site kept the files its pages point at.
 *
 * `/media/` is only interesting under `k2/`: the rest of it is Joomla's own JavaScript and language
 * switcher icons, which robots.txt was right to keep crawlers away from.
 */
const ASSET_DIRECTORIES = ['/images/', '/cache/', '/uploads/', '/media/k2/'];

export type LinkKind = 'k2-item' | 'k2-category' | 'k2-user' | 'feed' | 'article' | 'entry' | 'asset' | 'theme' | 'other';

export interface ParsedUrl {
  url: string;
  path: string;
  search: string;
  lang: string;
  kind: LinkKind;
  id?: number;
}

/** Absolute, normalised, deduplicated — or null when the href is not a page of this site. */
export function normalize(rawHref: string, baseUrl: string): string | null {
  let absolute: URL;
  try {
    absolute = new URL(decodeEntities(rawHref), baseUrl);
  } catch {
    return null;
  }
  if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') return null;
  if (absolute.hostname.toLowerCase().replace(/^www\./, '') !== SITE_HOST) return null;

  absolute.hash = '';
  absolute.hostname = SITE_HOST;
  absolute.port = '';
  absolute.protocol = 'https:';

  const keep = new URLSearchParams();
  for (const key of KEEP_QUERY) {
    const value = absolute.searchParams.get(key);
    if (value !== null) keep.set(key, value);
  }
  absolute.search = keep.toString();

  let path = absolute.pathname.replace(/\/index\.php\//i, '/').replace(/\/index\.php$/i, '/');
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/';
  absolute.pathname = path;

  return absolute.toString();
}

export function langOf(url: string): string {
  const first = new URL(url).pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  return (first && LANG_BY_PREFIX[first]) ?? '';
}

/** The language the page was written in, or '' for the shared root and unprefixed addresses. */
export function entryLanguage(url: string): string {
  const lang = langOf(url);
  if (lang) return lang;
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'uz';
  return '';
}

export function parseSiteUrl(rawHref: string, baseUrl: string): ParsedUrl | null {
  const url = normalize(rawHref, baseUrl);
  if (!url) return null;
  return classify(url);
}

export function classify(url: string): ParsedUrl {
  const parsed = new URL(url);
  const path = decodeEntities(parsed.pathname);
  const search = parsed.search;

  const item = /(?:^|\/)(?:component\/k2\/)?(?:itemlist\/)?item\/(\d+)(?:-[^/?]*)?(?:\.html?)?$/i.exec(path);
  const category = /(?:^|\/)(?:component\/k2\/)?itemlist\/category\/(\d+)(?:-[^/?]*)?(?:\.html?)?$/i.exec(path);
  const user = /(?:^|\/)(?:component\/k2\/)?itemlist\/user\/(\d+)(?:-[^/?]*)?(?:\.html?)?$/i.exec(path);

  let kind: LinkKind = 'other';
  let id: number | undefined;

  const feed = parsed.searchParams.get('format');

  if (feed === 'feed' || feed === 'rss' || feed === 'atom' || /\.feed$/i.test(path)) {
    // A feed repeats the listing in XML. The HTML listing is what the import reads, and the feed would
    // be asked for it again on every category.
    kind = 'feed';
  } else if (item) {
    kind = 'k2-item';
    id = Number(item[1]);
  } else if (category) {
    kind = 'k2-category';
    id = Number(category[1]);
  } else if (user) {
    kind = 'k2-user';
    id = Number(user[1]);
  } else if (THEME_DIRECTORIES.some((dir) => path.startsWith(dir))) {
    kind = 'theme';
  } else if (isAssetPath(path)) {
    kind = 'asset';
  } else if (path === '/' || /\/(ru|en|en-ca)$/i.test(path)) {
    kind = 'entry';
  } else if (/\.html?$/i.test(path) || /^\/(ru|en|en-ca)\//i.test(path)) {
    // Joomla writes some menu addresses with `.html` and some without; both are pages of content.
    kind = path.includes('/component/') ? 'other' : 'article';
  }

  return { url, path: parsed.pathname, search, lang: langOf(url), kind, id };
}

function isAssetPath(path: string): boolean {
  if (ASSET_DIRECTORIES.some((dir) => path.startsWith(dir))) return true;
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return extension.length > 1 && extension.length <= 5 && ASSET_EXTENSIONS.includes(extension);
}

/** Pages worth fetching while mapping the site: articles, K2 items and category listings. */
export function isCrawlable(kind: LinkKind): boolean {
  return kind === 'k2-item' || kind === 'k2-category' || kind === 'k2-user' || kind === 'article' || kind === 'entry';
}

const HREF_PATTERN = /(?:href|src|data-src)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const OG_IMAGE_PATTERN = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;

/**
 * Every address written into a document, in the order a reader would meet them.
 *
 * Pagination is not special-cased: a listing links its neighbouring offsets, so the next page of a
 * category arrives here like any other address and the walk continues on its own.
 */
export function extractLinks(html: string, baseUrl: string): ParsedUrl[] {
  const found: ParsedUrl[] = [];
  const seen = new Set<string>();
  const raws: string[] = [];

  HREF_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_PATTERN.exec(html))) {
    raws.push(match[2] ?? match[3] ?? '');
  }
  OG_IMAGE_PATTERN.lastIndex = 0;
  while ((match = OG_IMAGE_PATTERN.exec(html))) {
    raws.push(match[1] ?? '');
  }

  for (const raw of raws) {
    if (!raw || !looksLikeAddress(raw)) continue;
    if (raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('javascript:') || raw.startsWith('+')) continue;
    const parsed = parseSiteUrl(raw, baseUrl);
    if (parsed && !seen.has(parsed.url)) {
      seen.add(parsed.url);
      found.push(parsed);
    }
  }
  return found;
}

/** A URL as the site wrote it is not always a URL: template JavaScript leaves fragment strings behind. */
function looksLikeAddress(raw: string): boolean {
  return !raw.includes("'") && !raw.includes('"') && !raw.includes('\\');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}
