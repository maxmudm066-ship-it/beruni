import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CONTENT_TYPE_MAP, MEDIA_FIELD_ROLE, type ContentTypeDef } from '../../src/lib/content-types';
import { sanitizeContentHtml } from '../../src/lib/content/sanitize-rules';
import { prisma } from '../../src/lib/db';
import { MediaUploadError, storeUpload } from '../../src/lib/media/upload';
import { checksum } from '../../src/lib/media/storage';
import { ARCHIVE, formatBytes, loadAssets, type AssetRecord } from './lib/archive';
import {
  anchorHrefs,
  figureBlock,
  imageSrcs,
  rewriteAnchors,
  setPictures,
  takeInlineNote,
  takeLeadPicture,
} from './lib/media-html';
import { loadLedger, loadStoredMedia, rememberStoredMedia, type LedgerEntry, type StoredMedia } from './lib/ledger';

/**
 * Pass 3b: the files of the old site become files of this site.
 *
 * The downloading half of the pass kept the bytes; this half gives every material its own copy of them
 * and rewrites its text to point at them. Three things happen to a draft, and all three are needed
 * before the old site can stop mattering:
 *
 * — the picture the old page printed above the text becomes the material's «Main Image», which is where
 *   the public page reads its header from, and leaves the text so the same photo is not shown twice;
 * — every other picture becomes the block the rich-text editor writes for an image, because a bare
 *   `<img>` is not something the panel reads back: it would vanish the first time a person saves;
 * — a link to a PDF or a document becomes one of the material's own files and is rewritten to the new
 *   address, so the download works after the old site is switched off.
 *
 * A file the archive does not hold yet stops the whole material, not just that one reference: a draft
 * is rewritten once, completely, or left exactly as it is for the next run. Nothing is discarded
 * because a download failed — the old address stays in the text and the report names the material.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/migrate/load-media.ts --dry-run
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/migrate/load-media.ts --user=admin
 *   … --limit=20 --lang=uz --type=news
 */

const HOST = 'https://beruni.uz';
const ROOT_FOLDER = 'Beruniy.uz';
const INLINE_FOLDER = 'картинки из текста';
const CHANGE_SUMMARY = 'Проход 3: файлы перенесены в Медиатеку';

/** An old page address is not a file. Everything else carrying an extension is treated as one. */
const NOT_FILE_EXTENSIONS = new Set(['', 'html', 'htm', 'php', 'asp', 'aspx', 'js', 'css']);
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** Where a linked document belongs: the type's own file list when it has one, else its attachments. */
const DOCUMENT_FIELDS = ['file', 'fullText', 'digitalFiles', 'documents', 'attachments'];

/** Which optimised copy a text shows, widest-first among the webp sizes. */
const VARIANT_PREFERENCE = ['medium', 'small', 'thumb', 'large'];

interface Options {
  dryRun: boolean;
  user: string;
  userId: string;
  limit: number;
  onlyLanguages: string[] | null;
  onlyTypes: string[] | null;
}

/** One file of the old site, named in the text however the old page happened to write it. */
interface Ref {
  /** Decoded path on the old site — the key the archive and the journal use. */
  key: string;
  /** Every spelling the text used for it, since a rewrite replaces the written string. */
  written: string[];
  embedded: boolean;
  linked: boolean;
}

type Outcome = 'rewritten' | 'would' | 'waiting' | 'untouched';

interface Item {
  id: string;
  groupId: string;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  status: string;
  body: string | null;
  revision: number;
  canonicalUrl: string | null;
}

/** A file already in the Media Library, found by its old address or by its content. */
interface Asset {
  mediaId: string;
  publicUrl: string;
  displayUrl: string;
}

interface Ctx {
  ready: Map<string, AssetRecord>;
  known: Set<string>;
  media: Map<string, StoredMedia>;
  byDigest: Map<string, Asset>;
  folders: Map<string, string>;
  journal: StoredMedia[];
  userId: string;
  dryRun: boolean;
}

interface Tally {
  rewritten: number;
  would: number;
  untouched: number;
  waiting: number;
  gone: number;
  stored: number;
  bytes: number;
  reused: number;
  links: number;
  canonicals: number;
  dead: Set<string>;
  rejected: { title: string; why: string }[];
  failures: { title: string; error: string }[];
  byKind: Map<string, number>;
  samples: { title: string; path: string; pictures: number; files: number }[];
}

interface Totals {
  transferred: number;
  links: number;
  library: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: argv.includes('--dry-run'),
    user: '',
    userId: '',
    limit: 0,
    onlyLanguages: null,
    onlyTypes: null,
  };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [flag, value = ''] = arg.slice(2).split('=');
    if (flag === 'user') options.user = value;
    if (flag === 'limit') options.limit = Number(value) || 0;
    if (flag === 'lang') options.onlyLanguages = csv(value);
    if (flag === 'type') options.onlyTypes = csv(value);
  }
  return options;
}

function csv(value: string): string[] | null {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

function short(title: string): string {
  return title.length > 52 ? `${title.slice(0, 52)}…` : title;
}

function decodedPathname(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
}

/**
 * The address of a reference as the archive knows it, or null when the reference is not a file of the
 * old site. An address of this site's own uploads is a finished transfer, not something to fetch.
 */
function oldFileOf(written: string): { key: string } | null {
  const value = written.trim();
  if (!value || value.startsWith('data:') || value.startsWith('/uploads/')) return null;
  const absolute = /^https?:/i.test(value) ? value : value.startsWith('//') ? `https:${value}` : value.startsWith('/') ? `${HOST}${value}` : '';
  if (!absolute.startsWith(HOST)) return null;
  const key = decodedPathname(absolute);
  if (!key) return null;
  const extension = (path.extname(key) || '').slice(1).toLowerCase();
  if (NOT_FILE_EXTENSIONS.has(extension)) return null;
  return { key };
}

/** The files the text names, one entry per file however many times or ways it is written. */
function referencesOf(body: string): Ref[] {
  const embedded = new Set(imageSrcs(body));
  const linked = new Set(anchorHrefs(body));
  const byKey = new Map<string, Ref>();
  for (const written of [...embedded, ...linked]) {
    const found = oldFileOf(written);
    if (!found) continue;
    const row = byKey.get(found.key) ?? { key: found.key, written: [], embedded: false, linked: false };
    row.written.push(written);
    if (embedded.has(written)) row.embedded = true;
    if (linked.has(written)) row.linked = true;
    byKey.set(found.key, row);
  }
  return [...byKey.values()];
}

function displayUrlFor(media: { publicUrl: string; variants: { role: string; publicUrl: string }[] }): string {
  for (const role of VARIANT_PREFERENCE) {
    const variant = media.variants.find((row) => row.role === role);
    if (variant) return variant.publicUrl;
  }
  return media.publicUrl;
}

function folderChainFor(key: string): string[] {
  const dirs = key.split('/').filter(Boolean).slice(0, -1).slice(0, 2);
  return [ROOT_FOLDER, ...dirs.map((part) => part.replace(/[\\/<>"']/g, '-').trim().slice(0, 60))];
}

async function ensureFolder(name: string, parentId: string | null): Promise<string> {
  const found = await prisma.mediaFolder.findFirst({ where: { name, parentId }, select: { id: true } });
  if (found) return found.id;
  return (await prisma.mediaFolder.create({ data: { name, parentId }, select: { id: true } })).id;
}

async function folderIdFor(chain: string[], ctx: Ctx): Promise<string | null> {
  if (ctx.dryRun) return null;
  const cached = ctx.folders.get(chain.join('/'));
  if (cached) return cached;

  let parentId: string | null = null;
  const walked: string[] = [];
  for (const name of chain) {
    walked.push(name);
    parentId = await ensureFolder(name, parentId);
    ctx.folders.set(walked.join('/'), parentId);
  }
  return parentId;
}

/** One archived file as an asset of the Media Library. Files with equal bytes become one asset. */
async function storeAsMedia(
  input: { key: string; originalName: string; bytes: Buffer; chain: string[]; alt?: string },
  ctx: Ctx,
  tally: Tally,
  title: string,
): Promise<Asset | null> {
  const already = ctx.media.get(input.key);
  if (already) return already;
  if (ctx.dryRun) return { mediaId: 'dry-run', publicUrl: input.key, displayUrl: input.key };

  const digest = checksum(input.bytes);
  const twin = ctx.byDigest.get(digest);
  let asset: Asset;
  if (twin) {
    asset = twin;
    tally.reused += 1;
  } else {
    try {
      const media = await storeUpload({
        originalName: input.originalName,
        data: new Uint8Array(input.bytes),
        folderId: await folderIdFor(input.chain, ctx),
        altText: input.alt ?? null,
        userId: ctx.userId,
      });
      asset = { mediaId: media.id, publicUrl: media.publicUrl, displayUrl: displayUrlFor(media) };
      tally.stored += 1;
      tally.bytes += input.bytes.byteLength;
      tally.byKind.set(media.kind, (tally.byKind.get(media.kind) ?? 0) + 1);
      ctx.byDigest.set(digest, asset);
    } catch (error) {
      // The library's own ceilings and format list decide this; the text keeps the old address.
      if (error instanceof MediaUploadError) {
        tally.rejected.push({ title: short(title), why: `${path.basename(input.key)} — ${error.key}` });
        return null;
      }
      throw error;
    }
  }

  const row: StoredMedia = {
    url: input.key,
    mediaId: asset.mediaId,
    publicUrl: asset.publicUrl,
    displayUrl: asset.displayUrl,
    digest,
    at: new Date().toISOString(),
  };
  ctx.media.set(input.key, row);
  ctx.journal.push(row);
  return asset;
}

function documentRole(def: ContentTypeDef | undefined): string {
  for (const name of DOCUMENT_FIELDS) {
    if (def?.fields.some((field) => field.name === name)) return MEDIA_FIELD_ROLE[name];
  }
  return 'attachment';
}

/**
 * One material: its files become assets, its text is rewritten to point at them, its lead picture moves
 * out of the text into «Main Image». 'untouched' means the draft already speaks only of our own files.
 */
async function processEntry(entry: LedgerEntry, item: Item, ctx: Ctx, tally: Tally): Promise<Outcome> {
  // This pass detaches a text from the old site completely — its files and its canonical address, so
  // search engines are not asked to prefer the page our own 301 list redirects from.
  if (item.canonicalUrl?.startsWith(HOST)) {
    tally.canonicals += 1;
    if (!ctx.dryRun) await prisma.contentItem.update({ where: { id: item.id }, data: { canonicalUrl: null } });
  }

  const original = item.body ?? '';
  const refs = referencesOf(original);
  const isPending = (ref: Ref) => !ctx.media.has(ref.key) && !ctx.ready.has(ref.key) && !ctx.known.has(ref.key);
  if (refs.some(isPending)) return 'waiting';
  if (!refs.length && !entry.inline.length) return 'untouched';

  const def = CONTENT_TYPE_MAP.get(entry.typeKey);
  const load = async (key: string): Promise<Asset | null> => {
    const hit = ctx.media.get(key);
    if (hit) return hit;
    const record = ctx.ready.get(key);
    if (!record) {
      // Journaled but without bytes: the old site answered 404, or the file was too big to take.
      tally.dead.add(key);
      return null;
    }
    const bytes = record.bytes > 0 && existsSync(record.file) ? readFileSync(record.file) : null;
    if (!bytes) {
      tally.dead.add(key);
      return null;
    }
    return storeAsMedia({ key, originalName: path.basename(key), bytes, chain: folderChainFor(key) }, ctx, tally, entry.title);
  };

  let body = original;
  const pictures = new Map<string, { url: string; mediaId: string }>();
  const anchors = new Map<string, string>();
  const wanted: { role: string; mediaId: string; caption: string | null }[] = [];
  let shown = 0;
  let files = 0;

  // The picture the old page placed first is the material's header image, not a line of its text.
  const lead = takeLeadPicture(body);
  const leadKey = lead ? oldFileOf(lead.picture.src)?.key ?? null : null;
  if (lead && leadKey) {
    const asset = await load(leadKey);
    if (asset) {
      body = lead.rest;
      wanted.push({ role: 'main', mediaId: asset.mediaId, caption: lead.caption || null });
      shown += 1;
    }
  }

  for (const ref of refs) {
    if (ref.key === leadKey) continue;
    const asset = await load(ref.key);
    if (!asset) continue;
    if (ref.embedded) shown += 1;
    // A linked document becomes a file of the material; a linked picture stays only in the text, or
    // the public page would show the same image twice.
    const attaches = ref.linked && !IMAGE_EXTENSION.test(ref.key);
    if (attaches) {
      files += 1;
      if (asset.mediaId !== 'dry-run') wanted.push({ role: documentRole(def), mediaId: asset.mediaId, caption: null });
    }
    if (asset.mediaId !== 'dry-run') {
      for (const written of ref.written) {
        if (ref.embedded) pictures.set(written, { url: asset.displayUrl, mediaId: asset.mediaId });
        if (ref.linked) anchors.set(written, asset.publicUrl);
      }
    }
  }

  // Three old pages carried a photograph as base64 in the text; pass 2 left a note where it was cut out.
  const inlineBlocks: string[] = [];
  for (const name of entry.inline) {
    const key = `inline://${name}`;
    const bytes = !ctx.dryRun && existsSync(path.join(ARCHIVE, 'inline', name)) ? readFileSync(path.join(ARCHIVE, 'inline', name)) : null;
    const asset = ctx.dryRun
      ? { mediaId: 'dry-run', publicUrl: key, displayUrl: key }
      : bytes
        ? await storeAsMedia({ key, originalName: name, bytes, chain: [ROOT_FOLDER, INLINE_FOLDER], alt: name }, ctx, tally, entry.title)
        : null;
    if (!asset) continue;
    if (asset.mediaId !== 'dry-run' && body.includes(asset.mediaId)) continue;
    inlineBlocks.push(figureBlock({ src: asset.displayUrl, alt: name }, asset.mediaId));
    shown += 1;
  }
  if (inlineBlocks.length) {
    const note = takeInlineNote(body, entry.inline[0] ?? '', inlineBlocks.join(''));
    // If a person removed the note line, the picture is appended rather than lost.
    body = note.replaced ? note.html : `${body}${inlineBlocks.join('')}`;
  }

  body = setPictures(body, pictures);
  body = rewriteAnchors(body, anchors);

  // A version is only worth writing when a file actually arrived; a text that merely got a cleaner
  // look stays at the version the material pass gave it.
  const changed = shown > 0 || files > 0 || inlineBlocks.length > 0 || body !== original;
  if (!changed) return 'untouched';
  if (ctx.dryRun) {
    tally.would += 1;
    if (tally.samples.length < 15) tally.samples.push({ title: short(entry.title), path: entry.newPath, pictures: shown, files });
    return 'would';
  }

  const existing = await prisma.mediaLink.findMany({
    where: { groupId: item.groupId },
    select: { role: true, mediaId: true, sortOrder: true },
  });
  const have = new Set(existing.map((link) => `${link.role}:${link.mediaId}`));
  let lastOrder = existing.reduce((max, link) => Math.max(max, link.sortOrder), -1);
  const toAdd = wanted.filter((link) => {
    if (have.has(`${link.role}:${link.mediaId}`)) return false;
    have.add(`${link.role}:${link.mediaId}`);
    return true;
  });

  const text = sanitizeContentHtml(body);
  const version = item.revision + 1;
  await prisma.$transaction(async (tx) => {
    for (const link of toAdd) {
      lastOrder += 1;
      await tx.mediaLink.create({
        data: { groupId: item.groupId, mediaId: link.mediaId, role: link.role, caption: link.caption, sortOrder: lastOrder },
      });
    }
    await tx.contentItem.update({ where: { id: item.id }, data: { body: text, revision: version, updatedById: ctx.userId } });
    await tx.contentRevision.create({
      data: {
        itemId: item.id,
        version,
        changedById: ctx.userId,
        changeSummary: CHANGE_SUMMARY,
        title: item.title,
        subtitle: item.subtitle,
        slug: item.slug,
        excerpt: item.excerpt,
        body: text,
        status: item.status,
      },
    });
  });

  tally.rewritten += 1;
  tally.links += toAdd.length;
  return 'rewritten';
}

async function loadItem(entry: LedgerEntry): Promise<Item | null> {
  const item = await prisma.contentItem.findUnique({
    where: { id: entry.itemId },
    select: {
      id: true,
      groupId: true,
      title: true,
      subtitle: true,
      slug: true,
      excerpt: true,
      status: true,
      body: true,
      revision: true,
      canonicalUrl: true,
      deletedAt: true,
    },
  });
  return item && !item.deletedAt ? item : null;
}

function report(tally: Tally, entries: number, dryRun: boolean, totals: Totals): string {
  const lines = [
    '# Проход 3: файлы в Медиа-библиотеке',
    '',
    `Материалов в журнале переноса: ${entries}.`,
    '',
    '## Этого запуска',
    '',
    dryRun
      ? `- переписали бы: ${tally.would}`
      : `- переписано текстов: ${tally.rewritten}`,
    `- новых файлов в Медиатеке: ${tally.stored} (${formatBytes(tally.bytes)})`,
    `- совпало по содержанию с уже загруженным: ${tally.reused}`,
    `- ссылок-файлов добавлено к материалам: ${tally.links}`,
    `- канонических адресов со старого сайта убрано: ${tally.canonicals}`,
    `- текстов, где всё уже на месте: ${tally.untouched}`,
    `- ждут докачки: ${tally.waiting}`,
    `- материалов больше нет в базе: ${tally.gone}`,
    `- ссылок на файл, которого больше нет: ${tally.dead.size}`,
    `- не принято Медиа-библиотекой: ${tally.rejected.length}`,
    '',
    `Виды файлов: ${[...tally.byKind.entries()].map(([kind, n]) => `${kind}=${n}`).join(', ') || '—'}.`,
    '',
    '## Всего после переноса файлов',
    '',
    `- файлов старого сайта в Медиатеке: ${totals.transferred}`,
    `- файлов в Медиатеке всего: ${totals.library}`,
    `- ссылок-файлов у материалов всего: ${totals.links}`,
    '',
    `Файлы лежат в папке «${ROOT_FOLDER}» и её подразделах по каталогам старого сайта; картинки из base64 — в «${INLINE_FOLDER}».`,
    'Картинки внутри текста остаются только в тексте и не дублируются в приложения материала.',
    '',
    '## Примеры',
    '',
    ...tally.samples.map((row) => `- ${row.title} → ${row.path} (картинок ${row.pictures}, файлов ${row.files})`),
  ];
  if (tally.rejected.length) {
    lines.push('', '## Не принято Медиа-библиотекой', '', ...tally.rejected.slice(0, 80).map((row) => `- ${row.title}: ${row.why}`));
  }
  if (tally.failures.length) {
    lines.push('', '## Сбои', '', ...tally.failures.slice(0, 80).map((row) => `- ${row.title} — ${row.error}`));
  }
  return `${lines.join('\n')}\n`;
}

async function resolveUser(raw: string): Promise<string> {
  const needle = raw.trim();
  if (!needle) throw new Error('нужен автор записей: --user=<логин администратора>');
  const found =
    needle.length > 12
      ? await prisma.user.findUnique({ where: { id: needle }, select: { id: true, displayName: true } })
      : await prisma.user.findUnique({ where: { username: needle }, select: { id: true, displayName: true } });
  if (!found) throw new Error(`администратор «${needle}» не найден`);
  console.log(`автор записей: ${found.displayName}`);
  return found.id;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const ledger = loadLedger();
  if (!ledger.size) {
    console.error('Журнал переноса пуст — сначала выполните import-drafts.ts');
    process.exitCode = 1;
    return;
  }

  const ready = new Map<string, AssetRecord>();
  const known = new Set<string>();
  for (const record of loadAssets().values()) {
    const key = decodedPathname(record.url);
    if (!key) continue;
    known.add(key);
    if (record.status === 200 && record.bytes > 0 && existsSync(record.file)) ready.set(key, record);
  }

  const ctx: Ctx = {
    ready,
    known,
    media: new Map(),
    byDigest: new Map(),
    folders: new Map(),
    journal: [],
    userId: options.userId,
    dryRun: options.dryRun,
  };
  for (const row of loadStoredMedia().values()) {
    const key = row.url.startsWith('inline://') ? row.url : decodedPathname(row.url) ?? row.url;
    ctx.media.set(key, row);
    if (row.digest && !ctx.byDigest.has(row.digest)) ctx.byDigest.set(row.digest, row);
  }

  // A file a person uploaded by hand is the same file: identity is the bytes, not the old address.
  const uploaded = await prisma.media.findMany({
    where: { checksum: { not: null } },
    select: { id: true, publicUrl: true, checksum: true, variants: { select: { role: true, publicUrl: true } } },
  });
  for (const media of uploaded) {
    if (media.checksum && !ctx.byDigest.has(media.checksum)) {
      ctx.byDigest.set(media.checksum, { mediaId: media.id, publicUrl: media.publicUrl, displayUrl: displayUrlFor(media) });
    }
  }

  if (!options.dryRun) ctx.userId = await resolveUser(options.user);

  const entries = [...ledger.values()].filter(
    (entry) =>
      (!options.onlyLanguages || options.onlyLanguages.includes(entry.lang)) &&
      (!options.onlyTypes || options.onlyTypes.includes(entry.typeKey)),
  );
  console.log(
    `материалов: ${entries.length} | файлов в архиве: ${ready.size}/${known.size} | уже в Медиатеке: ${ctx.media.size}` +
      `${options.dryRun ? ' | пробег без записи' : ''}`,
  );

  const tally: Tally = {
    rewritten: 0,
    would: 0,
    untouched: 0,
    waiting: 0,
    gone: 0,
    stored: 0,
    bytes: 0,
    reused: 0,
    links: 0,
    canonicals: 0,
    dead: new Set(),
    rejected: [],
    failures: [],
    byKind: new Map(),
    samples: [],
  };

  let processed = 0;
  for (const entry of entries) {
    if (options.limit && processed >= options.limit) break;
    const item = await loadItem(entry);
    if (!item) {
      tally.gone += 1;
      continue;
    }
    processed += 1;
    try {
      const outcome = await processEntry(entry, item, ctx, tally);
      if (outcome === 'waiting') tally.waiting += 1;
      else if (outcome === 'untouched') tally.untouched += 1;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      tally.failures.push({ title: short(entry.title), error: why.slice(0, 200) });
      console.error(`  сбой ${entry.lang} «${short(entry.title)}»: ${why.slice(0, 160)}`);
    }

    if (ctx.journal.length >= 40) {
      rememberStoredMedia(ctx.journal);
      ctx.journal = [];
    }
    if (processed % 25 === 0) {
      console.log(
        `${processed}/${entries.length} · готово ${tally.rewritten || tally.would} · файлов ${tally.stored} (${formatBytes(tally.bytes)}) · ждут ${tally.waiting}`,
      );
    }
  }

  rememberStoredMedia(ctx.journal);

  // The report is read after a second run as well, where everything above reports a quiet pass; the
  // figures of the whole transfer come from the journal and the library so the file never says less
  // than the transfer did.
  const transferred = new Set([...loadStoredMedia().values()].map((row) => row.mediaId));
  const totals = {
    transferred: transferred.size,
    links: await prisma.mediaLink.count(),
    library: await prisma.media.count(),
  };
  const file = path.join(ARCHIVE, 'inventory', 'media-load.md');
  writeFileSync(file, report(tally, entries.length, options.dryRun, totals), 'utf8');

  console.log(
    `\nтекстов переписано: ${options.dryRun ? tally.would : tally.rewritten} | файлов: ${tally.stored} (повторов ${tally.reused}) | ссылок: ${tally.links} | каноников убрано: ${tally.canonicals} | ждут: ${tally.waiting} | сбоев: ${tally.failures.length}`,
  );
  for (const row of tally.samples.slice(0, options.dryRun ? 12 : 0)) {
    console.log(`  ${row.title} → ${row.path} (картинок ${row.pictures}, файлов ${row.files})`);
  }
  console.log(`отчёт: ${file}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
