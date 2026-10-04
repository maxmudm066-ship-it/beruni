/**
 * The local copy of the old site.
 *
 * Nothing here is derived data: the archive keeps the bytes `beruni.uz` answered, and until a person
 * has checked the import those bytes are the reason a parser can be rewritten and run again without
 * asking the live site a second time. Two append-only journals sit beside the files — one line per
 * fetched page, one line per discovered address — so an interrupted crawl resumes from the journals
 * rather than from a re-read of the tree.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The archive lives beside the project, not inside it: it is a backup, not source. */
function findRoot(): string {
  const candidates = [
    typeof __dirname === 'undefined' ? null : path.resolve(__dirname, '..', '..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const root = candidates.find((candidate) => existsSync(path.join(candidate, 'prisma', 'schema.prisma')));
  if (!root) throw new Error('run the migration scripts from the project root (where prisma/schema.prisma is)');
  return root;
}

export const ROOT = findRoot();

export const ARCHIVE = process.env.BERUNI_ARCHIVE_DIR
  ? path.resolve(process.env.BERUNI_ARCHIVE_DIR)
  : path.resolve(ROOT, '..', 'beruni-uz-archive');

const PAGES = path.join(ARCHIVE, 'pages');
const FILES = path.join(ARCHIVE, 'files');
const INDEX = path.join(ARCHIVE, 'index');
const PAGES_JOURNAL = path.join(INDEX, 'pages.jsonl');
const LINKS_JOURNAL = path.join(INDEX, 'links.jsonl');
const ASSETS_JOURNAL = path.join(INDEX, 'assets.jsonl');

export interface PageRecord {
  url: string;
  sha: string;
  status: number;
  bytes: number;
  at: string;
  kind?: string;
  id?: number;
  lang?: string;
  /** The address this one was found on — the crawl trail, kept so a dead end is explainable. */
  from?: string;
}

export interface LinkRecord {
  url: string;
  kind: string;
  id?: number;
  lang: string;
  from: string;
  at: string;
}

export interface AssetRecord {
  url: string;
  sha: string;
  file: string;
  status: number;
  bytes: number;
  contentType: string;
  at: string;
  /** Which material wanted the file, and in what role — decided in the asset pass. */
  reason?: string;
}

export function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function ensureDirs(): void {
  for (const dir of [PAGES, FILES, INDEX]) mkdirSync(dir, { recursive: true });
}

export function pagePath(sha: string): string {
  return path.join(PAGES, sha.slice(0, 2), `${sha}.html`);
}

/** The bytes kept for one address, or null when the crawl never got an answer for it. */
export function readPage(sha: string): string | null {
  const file = pagePath(sha);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

export function assetPath(sha: string, extension: string): string {
  return path.join(FILES, sha.slice(0, 2), `${sha}${extension}`);
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const rows: T[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      // A torn last line from an interrupted write is not worth stopping a crawl over.
    }
  }
  return rows;
}

function appendLines<T>(file: string, records: T[]): void {
  if (!records.length) return;
  ensureDirs();
  appendFileSync(file, records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
}

/** Every address already answered, newest winning if one was fetched twice. */
export function loadPages(): Map<string, PageRecord> {
  const map = new Map<string, PageRecord>();
  for (const record of readJsonl<PageRecord>(PAGES_JOURNAL)) map.set(record.url, record);
  return map;
}

export function loadLinks(): Map<string, LinkRecord> {
  const map = new Map<string, LinkRecord>();
  for (const record of readJsonl<LinkRecord>(LINKS_JOURNAL)) map.set(record.url, record);
  return map;
}

export function loadAssets(): Map<string, AssetRecord> {
  const map = new Map<string, AssetRecord>();
  for (const record of readJsonl<AssetRecord>(ASSETS_JOURNAL)) map.set(record.url, record);
  return map;
}

/** Stores the raw answer and journals it; returns the file so a caller can log where it landed. */
export function savePage(html: string, meta: Omit<PageRecord, 'at' | 'bytes'>): string {
  ensureDirs();
  const target = pagePath(meta.sha);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');
  appendLines(PAGES_JOURNAL, [{ ...meta, bytes: Buffer.byteLength(html), at: new Date().toISOString() }]);
  return target;
}

export function saveAsset(data: Buffer, url: string, contentType: string, status: number, reason?: string): string {
  ensureDirs();
  const sha = sha1(url);
  const extension = (path.extname(new URL(url).pathname) || '').slice(0, 8).replace(/[^.a-z0-9]/gi, '');
  const target = assetPath(sha, extension);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
  appendLines(ASSETS_JOURNAL, [
    { url, sha, file: target, status, bytes: data.byteLength, contentType, at: new Date().toISOString(), reason },
  ]);
  return target;
}

export function rememberLinks(records: LinkRecord[]): void {
  appendLines(LINKS_JOURNAL, records);
}

/** A dated note beside the archive, so a number in a report can be traced back to the run that made it. */
export function writeReport(name: string, text: string): string {
  ensureDirs();
  const target = path.join(INDEX, `${name}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.txt`);
  writeFileSync(target, text, 'utf8');
  return target;
}

function walk(dir: string): { files: number; bytes: number } {
  if (!existsSync(dir)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = walk(target);
      files += inner.files;
      bytes += inner.bytes;
    } else {
      files += 1;
      bytes += statSync(target).size;
    }
  }
  return { files, bytes };
}

export function archiveStats(): { pages: number; pageBytes: number; assets: number; assetBytes: number; dir: string } {
  const pages = walk(PAGES);
  const assets = walk(FILES);
  return { pages: pages.files, pageBytes: pages.bytes, assets: assets.files, assetBytes: assets.bytes, dir: ARCHIVE };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}
