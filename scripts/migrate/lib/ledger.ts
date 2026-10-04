import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHIVE } from './archive';

/**
 * What the migration has already written, kept beside the archive rather than in the database:
 * a rerun must not create a second copy of a material, and the old→new pairs are the source of
 * the 301 list. Append-only, newest line wins, so a crashed run leaves a readable trail.
 */
const DIR = path.join(ARCHIVE, 'ledger');
const JOURNAL = path.join(DIR, 'imported.jsonl');

export interface LedgerEntry {
  /** The inventory key of the material version that was written. */
  key: string;
  oldUrl: string;
  lang: string;
  typeKey: string;
  groupId: string;
  itemId: string;
  slug: string;
  /** Where the new site serves it, so a redirect and a link rewrite need no further lookup. */
  newPath: string;
  title: string;
  /** Other addresses that served this same text on the old site; each needs the same 301. */
  aliases: string[];
  /** File addresses inside the body that pass 3 still has to bring into the Media Library. */
  assets: string[];
  /** Pictures that were base64 inside the old text and are now files in the archive's `inline/`. */
  inline: string[];
  at: string;
}

export function loadLedger(): Map<string, LedgerEntry> {
  const out = new Map<string, LedgerEntry>();
  if (!existsSync(JOURNAL)) return out;
  for (const line of readFileSync(JOURNAL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LedgerEntry;
      out.set(entry.key, entry);
    } catch {
      // A torn last line only means the previous run was cut short.
    }
  }
  return out;
}

export function rememberImport(entries: LedgerEntry[]): void {
  if (!entries.length) return;
  mkdirSync(DIR, { recursive: true });
  appendFileSync(JOURNAL, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8');
}

/** Every old address the migration knows the answer to, for the redirect list. */
export function redirectPairs(ledger: Map<string, LedgerEntry>): { from: string; to: string }[] {
  const byFrom = new Map<string, string>();
  for (const entry of ledger.values()) {
    for (const url of [entry.oldUrl, ...entry.aliases]) {
      let pathname: string;
      try {
        pathname = new URL(url).pathname;
      } catch {
        continue;
      }
      if (pathname.startsWith('/')) byFrom.set(pathname, entry.newPath);
    }
  }
  return [...byFrom.entries()]
    .map(([from, to]) => ({ from, to }))
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** One old address whose file is now in the Media Library, so a rerun links instead of re-uploading. */
export interface StoredMedia {
  /** The archive key of the file: its old address, or `inline://<file>` for a base64 picture. */
  url: string;
  mediaId: string;
  /** Where the site serves the original bytes. */
  publicUrl: string;
  /** The optimised copy a text shows; the original is for a download link. */
  displayUrl: string;
  /** sha1 of the bytes: the same picture under two old names must become one asset. */
  digest: string;
  at: string;
}

const MEDIA_JOURNAL = path.join(DIR, 'media.jsonl');

export function loadStoredMedia(): Map<string, StoredMedia> {
  const out = new Map<string, StoredMedia>();
  if (!existsSync(MEDIA_JOURNAL)) return out;
  for (const line of readFileSync(MEDIA_JOURNAL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as StoredMedia;
      out.set(row.url, row);
    } catch {
      // A torn last line only means the previous run was cut short.
    }
  }
  return out;
}

export function rememberStoredMedia(rows: StoredMedia[]): void {
  if (!rows.length) return;
  mkdirSync(DIR, { recursive: true });
  appendFileSync(MEDIA_JOURNAL, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

/** Files pass 3 must download, keyed by address so the same picture used twice is fetched once. */
export function pendingAssets(ledger: Map<string, LedgerEntry>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const entry of ledger.values()) {
    for (const url of entry.assets) out.set(url, [...(out.get(url) ?? []), entry.key]);
  }
  return out;
}

export function ledgerPath(): string {
  return JOURNAL;
}
