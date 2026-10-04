/**
 * Turning a saved page of the old site back into a material.
 *
 * Two shapes exist, and nothing else: a K2 article (`<div id="k2Container">`, with the text inside
 * `.itemFullText`) and a plain Joomla article (`<article class="item-page">`, with the text loose
 * between the header and the closing tag). Everything else on the page — the menu, the sliders, the
 * rating widget, the "you might also like" blocks the template prints below every article — is the
 * template, not the content, so it is cut off rather than imported.
 *
 * Addresses inside the text are made absolute here and left pointing at `beruni.uz` on purpose: the
 * file pass recognises them later and replaces them with the copy it uploaded.
 */

import { classify, extractLinks } from './links';

export interface ParsedMaterial {
  url: string;
  lang: string;
  /** 'k2' when the page came from com_k2, 'joomla' for a plain article. */
  source: 'k2' | 'joomla';
  /** The number the old site gave this record, when its address carried one. */
  id?: number;
  title: string;
  bodyHtml: string;
  excerpt: string;
  /** The date the old site printed, in the site's own words. */
  printedDate: string;
  /** The same date as an ISO instant, or null when it was not written as a date. */
  publishedAt: string | null;
  categoryLabel: string;
  categoryId?: number;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  /** Every file the text points at (image, PDF, archive), absolute. */
  fileUrls: string[];
  /** Every old-site page the text links to, absolute — the graph used to rewrite links later. */
  pageUrls: string[];
  /** Old-site links that pointed outside the site, kept so a citation survives the move. */
  externalUrls: string[];
}

/** Where the article stops and the template chrome begins. */
const K2_CUTS = [
  '<div class="itemContentFooter"',
  '<div class="itemSocialSharing"',
  '<div class="itemAuthorBlock"',
  '<div class="itemAuthorLatest"',
  '<div class="itemNavigation"',
  '<div class="itemComments"',
  '<div id="k2Comments"',
];

/** This site's K2 override prints the rubric *after* the sharing block, so the metadata is read from
 *  a wider slice than the prose — everything up to the author box, hits and share buttons included. */
const K2_META_CUTS = [
  '<div class="itemAuthorBlock"',
  '<div class="itemAuthorLatest"',
  '<div class="itemNavigation"',
  '<div class="itemComments"',
  '<div id="k2Comments"',
];

/** This template prints the film clip after the author box, so the media of an item is only to be
 *  found in the widest slice that still stops before the next block of template chrome. */
const K2_MEDIA_CUTS = ['<div class="itemNavigation"', '<div class="itemComments"', '<div id="k2Comments"'];

const JOOMLA_CUTS = [
  '<footer',
  '<div class="article-footer',
  '<div class="modrelated',
  '<div class="itemComments',
  '<div id="k2Comments',
  '<nav',
];

export function parseArchivePage(html: string, url: string, lang: string): ParsedMaterial | null {
  // A category listing, an author page and a homepage all carry the same K2 markup around a list of
  // introductions. They are the site's shelves, not materials, and importing one would invent a news
  // item titled after whatever article happened to sit at the top of the page.
  const kind = classify(url).kind;
  if (kind !== 'k2-item' && kind !== 'article') return null;

  const k2Start = html.search(/<div[^>]+id="k2Container"/i);
  if (k2Start >= 0) {
    const scope = container(html, k2Start, K2_CUTS);
    const meta = container(html, k2Start, K2_META_CUTS);
    const media = container(html, k2Start, K2_MEDIA_CUTS);
    const full = extractRegion(scope, '<div class="itemFullText"', K2_CUTS);
    const intro = extractRegion(scope, '<div class="itemIntroText"', K2_CUTS);
    // An item written as "intro only" has no full text, and a full text left empty by the editor is
    // no text either: in both cases the intro is the whole story.
    // K2 prints the picture and the film clip in blocks around the text, so they are lifted in front
    // of it — unless the text already carries a frame of its own, which must not be duplicated.
    const text = hasText(full) ? full : hasText(intro) ? intro : full;
    const head = `${leadPicture(media)}${/<iframe/i.test(text) ? '' : leadVideo(media)}`;
    const body = `${head}${text}`;
    return material(
      html,
      scope,
      meta,
      url,
      lang,
      'k2',
      firstTagText(scope, 'itemTitle') || titleFrom(html),
      body,
    );
  }

  const articleStart = html.search(/<article[^>]+class="[^"]*item-page/i);
  if (articleStart >= 0) {
    const scope = html.slice(articleStart, html.indexOf('</article>', articleStart) + 10);
    const body = articleAfterHeader(scope);
    // A journal issue is often nothing but a cover image and a link to its PDF: short text is not
    // empty text, and dropping it would lose the issue.
    if (body && (stripTags(body).trim() || /<img|<a /i.test(body))) {
      return material(html, scope, scope, url, lang, 'joomla', articleTitle(scope) || titleFrom(html), body);
    }
  }
  return null;
}

/** The part of the page that is this material: from a marker to the first piece of template chrome. */
function container(html: string, from: number, ends: string[]): string {
  const end = indexOfFirst(html, ends, from);
  return html.slice(from, end < 0 ? html.length : end);
}

function material(
  html: string,
  scope: string,
  meta: string,
  url: string,
  lang: string,
  source: 'k2' | 'joomla',
  title: string,
  bodyHtml: string,
): ParsedMaterial {
  const body = absolutise(prepare(bodyHtml), url);
  const links = extractLinks(body, url);
  const files: string[] = [];
  const pages: string[] = [];
  for (const link of links) {
    if (link.kind === 'asset') files.push(link.url);
    else if (link.kind === 'k2-item' || link.kind === 'article' || link.kind === 'k2-category') pages.push(link.url);
  }

  const printedDate = firstTagText(scope, 'itemDateCreated') || firstTagText(scope, 'publish-date');
  const category = categoryLine(meta, url);

  return {
    url,
    lang,
    source,
    id: classify(url).id,
    title: cleanText(title),
    bodyHtml: body,
    excerpt: cleanText(metaContent(html, 'description')),
    printedDate: cleanText(printedDate),
    publishedAt: parsePrintedDate(printedDate),
    categoryLabel: category.label,
    categoryId: category.id,
    seoTitle: cleanText(metaContent(html, 'og:title') || metaContent(html, 'twitter:title')),
    seoDescription: cleanText(metaContent(html, 'og:description')),
    keywords: cleanText(metaContent(html, 'keywords')),
    fileUrls: [...new Set(files)],
    pageUrls: [...new Set(pages)],
    externalUrls: externalLinks(body, url),
  };
}

/** K2 prints the rubric as `<div class="itemCategory"><span>Published in</span>
 *  <a href="…/category/97-yangiliklar.html">Yangiliklar</a></div>`; com_content items print
 *  nothing at all, so their section only exists in the address. The anchor is the reliable part:
 *  the label arrives in whatever language the page was served in, the href carries the category id. */
function categoryLine(scope: string, baseUrl: string): { label: string; id?: number } {
  const at = scope.search(/class="[^"]*itemCategory[^"]*"/i);
  if (at < 0) return { label: '' };
  const link = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(scope.slice(at, at + 800));
  if (!link) return { label: '' };
  const label = cleanText(stripTags(link[2]));
  if (/^published in$/i.test(label)) return { label: '' };
  return { label, id: classify(absolute(link[1], baseUrl)).id };
}

// ── regions ───────────────────────────────────────────────────────────────────────────────

function indexOfFirst(haystack: string, needles: string[], from: number): number {
  let best = -1;
  for (const needle of needles) {
    const at = haystack.toLowerCase().indexOf(needle.toLowerCase(), from);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

/** Text between a start marker and the earliest of several end markers. */
function extractRegion(html: string, start: string, ends: string[]): string {
  const lower = html.toLowerCase();
  const from = lower.indexOf(start.toLowerCase());
  if (from < 0) return '';
  const open = html.indexOf('>', from);
  if (open < 0) return '';
  const end = indexOfFirst(html, ends, open + 1);
  return html.slice(open + 1, end < 0 ? html.length : end);
}

/**
 * K2 keeps the lead picture in its own block *above* the text region, and a photo report on the old
 * site is often only that: taking the text alone would import an empty page and throw the photo away.
 */
function leadPicture(scope: string): string {
  const region = extractRegion(scope, '<div class="itemImageBlock"', ['<div class="itemFullText"', '<div class="itemIntroText"']);
  const image = /<img\b[^>]*>/i.exec(region)?.[0] ?? '';
  if (!image) return '';
  // K2 prints a resized copy in the block and keeps the full one behind the modal link: the full one
  // is what pass 3 should bring into the Media Library.
  const src = /data-k2-modal="image"[\s\S]{0,80}?href="([^"]+)"/i.exec(region)?.[1]
    ?? /src="([^"]+)"/i.exec(image)?.[1]
    ?? '';
  const alt = /alt="([^"]*)"/i.exec(image)?.[1] ?? '';
  if (!src) return '';
  const caption = cleanText(stripTags(/class="itemImageCaption">([\s\S]*?)<\/p>/i.exec(scope)?.[1] ?? ''));
  return `<p><img src="${src}"${alt ? ` alt="${alt}"` : ''} /></p>${caption ? `<p><em>${caption}</em></p>` : ''}`;
}

/**
 * The film clip of a K2 item sits in its own block above the text, like the lead picture, so it has to
 * be lifted there too or 258 video reports arrive as empty pages. The block is AllVideos chrome around
 * one frame, so only the frame is taken.
 */
function leadVideo(scope: string): string {
  const frame = /<iframe\b[\s\S]*?<\/iframe>/i.exec(scope)?.[0] ?? '';
  if (!frame) return '';
  const caption = cleanText(stripTags(/class="itemVideoText">([\s\S]*?)<\/div>/i.exec(scope)?.[1] ?? ''));
  return `<p>${frame}</p>${caption ? `<p><em>${caption}</em></p>` : ''}`;
}

function hasText(html: string): boolean {
  return stripTags(html).replace(/[\s\u00a0]/g, '').length > 2;
}

/** A Joomla article has no body wrapper: the text is what follows its header inside `<article>`. */
function articleAfterHeader(html: string): string {
  const start = /<article[^>]+class="[^"]*item-page/i.exec(html);
  if (!start) return '';
  const header = html.indexOf('</header>', start.index);
  const aside = html.indexOf('</aside>', header + 1);
  const from = Math.max(header, aside) + 8;
  const end = indexOfFirst(html, [...JOOMLA_CUTS, '</article>'], from);
  return html.slice(from, end < 0 ? html.length : end);
}

// ── cleanup ───────────────────────────────────────────────────────────────────────────────

const JUNK_TAGS = [
  'script', 'style', 'noscript', 'object', 'embed', 'form', 'input', 'select', 'button',
  'font', 'xml', 'meta', 'link', 'ins', 'del', 'w:softpagebreak',
];

/** The video hosts both the editor and the HTML cleaner accept. */
const VIDEO_SRC = /^(https?:)?\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com)\/[^\s"']*/i;

/**
 * Removes what a page carries but a material does not need.
 *
 * The old text came out of Word: `<font>` markers, `<span style="font-family: ...">`, and comments
 * between paragraphs. The editor keeps alignment and colour only, so anything else here would be
 * dropped on the first save by a person opening the draft — dropping it now keeps the preview honest.
 */
function prepare(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ');
  // A film clip on the old site is a YouTube frame, on 289 pages. It is kept inside the wrapper the
  // editor itself writes, so opening the draft does not lose the video; any other frame is chrome.
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>|<iframe\b[^>]*\/?>/gi, (tag) => {
    const src = /src="([^"]+)"/i.exec(tag)?.[1] ?? '';
    return VIDEO_SRC.test(src) ? `<div data-youtube-video="true" class="tiptap-youtube">${tag}</div>` : ' ';
  });
  out = out.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (tag) => {
    const src = /src="([^"]+)"/i.exec(tag)?.[1] ?? '';
    return src ? `<p><a href="${src}">Видеоролик со старого сайта: ${src}</a></p>` : ' ';
  });
  for (const tag of JUNK_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), ' ');
  }
  // The lead picture is taken from its block by leadPicture; the wrapper itself is chrome.
  out = out.replace(/<div class="itemImageBlock"[\s\S]*?<\/div>/i, ' ');
  out = out.replace(/<div class="clr"\s*><\/div>/gi, ' ');
  out = out.replace(/<span[^>]*>\s*<\/span>/gi, ' ');
  out = out.replace(/<p[^>]*>\s*(&nbsp;|\s|<br\s*\/?>)+\s*<\/p>/gi, ' ');
  return out.trim();
}

function absolute(href: string, baseUrl: string): string {
  try {
    return new URL(decodeEntities(href), baseUrl).toString();
  } catch {
    return href;
  }
}

/** Old-site addresses, so a file or page inside the text can be matched again after the move. */
function absolutise(html: string, baseUrl: string): string {
  return html
    .replace(/(href|src|data-src)=(["'])([^"'>]+)\2/gi, (_all, name: string, quote: string, value: string) => {
      if (/^(data:|#|javascript:)/i.test(value)) return `${name}=${quote}${value}${quote}`;
      const resolved = absolute(value, baseUrl);
      return resolved === value ? `${name}=${quote}${value}${quote}` : `${name}=${quote}${resolved}${quote}`;
    });
}

function externalLinks(html: string, baseUrl: string): string[] {
  const here = new URL(baseUrl).hostname;
  const found: string[] = [];
  for (const match of html.matchAll(/href=(["'])(https?:\/\/[^"']+)\1/gi)) {
    try {
      const url = new URL(decodeEntities(match[2]));
      if (url.hostname !== here && !url.hostname.endsWith(`.${here}`)) found.push(url.toString());
    } catch {
      // A malformed link in the source is a broken link on the old site, not a reason to stop.
    }
  }
  return [...new Set(found)];
}

// ── small text helpers ────────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '));
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#8217;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** The first element carrying this class, as raw HTML — used to read a title out of the markup. */
function firstTag(html: string, className: string): string {
  const match = new RegExp(`<[^>]+class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]{0,600}?)<\\/`, 'i').exec(html);
  return match ? match[1] : '';
}

function firstTagText(html: string, className: string): string {
  return stripTags(firstTag(html, className));
}

function titleFrom(html: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1) return stripTags(h1[1]);
  const og = metaContent(html, 'og:title');
  if (og) return og;
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  return title ? stripTags(title[1]).replace(/\s*[-|]\s*Beruniy.*$/i, '') : '';
}

/** The heading the template printed inside the article header, which is the article's own title. */
function articleTitle(html: string): string {
  const header = /<header class="article-header"[\s\S]{0,600}?<\/header>/i.exec(html);
  if (!header) return '';
  const heading = /<h\d[^>]*>([\s\S]*?)<\/h\d>/i.exec(header[0]);
  return heading ? cleanText(stripTags(heading[1])) : '';
}

/**
 * The month names the old site used, in the three languages it published in.
 *
 * Dates were typed by hand as often as the template wrote them, so a page may carry "06 December
 * 2016", "Среда, 06 декабря 2017 16:56" or "12.03.2015". Anything that does not read as a date is
 * left null rather than guessed: a wrong publication date on a scientific article is worse than none.
 */
const MONTHS: Record<string, number> = {
  yanvar: 1, fevral: 2, mart: 3, aprel: 4, may: 5, iyun: 6, iyul: 7, avgust: 8, sentabr: 9, oktabr: 10, noyabr: 11, dekabr: 12,
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
  январь: 1, февраль: 2, март: 3, апрель: 4, июнь: 6, июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parsePrintedDate(text: string): string | null {
  const value = cleanText(text).toLowerCase();
  if (!value) return null;

  const written = /(\d{1,2})[\s.]+([а-яa-z]+)[\s,]+(\d{4})/i.exec(value);
  if (written) {
    const month = MONTHS[written[2].toLowerCase()];
    if (month) return iso(month, Number(written[1]), Number(written[3]), value);
  }

  const numeric = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/.exec(value);
  if (numeric) {
    const year = numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return iso(Number(numeric[2]), Number(numeric[1]), year, value);
  }
  return null;
}

function iso(month: number, day: number, year: number, source: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const stamp = new Date(Date.UTC(year, month - 1, day));
  if (stamp.getUTCMonth() !== month - 1 || stamp.getUTCDate() !== day) return null;
  // A printed time is kept: an announcement that says "14:00" means the afternoon, not the morning.
  // The old site wrote its dates in Tashkent time and Uzbekistan has no summer hours, so the wall
  // clock of the page is fixed at +05:00 — otherwise a news item lands five hours after it happened.
  const dayText = `${stamp.toISOString().slice(0, 10)}T00:00:00+05:00`;
  const time = /(\d{1,2}):(\d{2})/.exec(source);
  return time ? `${stamp.toISOString().slice(0, 11)}${time[1].padStart(2, '0')}:${time[2]}:00+05:00` : dayText;
}

function metaContent(html: string, name: string): string {
  const pattern = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=(["'])([\\s\\S]*?)\\1`, 'i');
  const other = new RegExp(`<meta[^>]+content=(["'])([\\s\\S]*?)\\1[^>]+(?:name|property)=["']${name}["']`, 'i');
  return decodeEntities((pattern.exec(html)?.[2] ?? other.exec(html)?.[2] ?? '').trim());
}
