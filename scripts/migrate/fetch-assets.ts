/**
 * Pass 3a of the transfer: the files the transferred texts point at.
 *
 * The material pass left every picture and PDF of the old site inside the drafts as an absolute
 * `https://beruni.uz/…` address, and wrote down which material wanted which file. This script walks
 * that list once and keeps the bytes in the archive beside the pages, so the texts can be given
 * files of their own later without asking the old site again — the old site is the only copy of
 * them until that second half of the pass is done.
 *
 * Politeness is the same as the page crawl's (one request at a time, a delay between them, backoff
 * on errors), and the asset journal makes the run resumable: an address already answered is never
 * fetched twice, so an interrupted night of downloading continues where it stopped.
 *
 * Usage: npx tsx scripts/migrate/fetch-assets.ts [--dry-run] [--limit=N] [--delay=ms] [--retry-dead]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHIVE, archiveStats, formatBytes, loadAssets, saveAsset, type AssetRecord } from './lib/archive';
import { fetchBytes, DEFAULT_DELAY_MS } from './lib/http';
import { loadLedger, pendingAssets, type LedgerEntry } from './lib/ledger';

/** The same ceilings the Media Library enforces, so nothing is downloaded that cannot be stored. */
const MAX_BYTES_BY_EXTENSION: Record<string, number> = { pdf: 60 * 1024 * 1024, zip: 60 * 1024 * 1024 };
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function limitFor(url: string): number {
  const extension = (path.extname(new URL(url).pathname) || '').replace('.', '').toLowerCase();
  return MAX_BYTES_BY_EXTENSION[extension] ?? DEFAULT_MAX_BYTES;
}

interface Tally {
  fetched: number;
  bytes: number;
  already: number;
  dead: number;
  tooBig: number;
  failed: { url: string; why: string }[];
}

function argument(name: string, fallback: string): string {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function report(tally: Tally, wanted: number, known: number): string {
  const lines = [
    '# Скачивание файлов старого сайта',
    '',
    `Файлов по текстам: ${wanted}, из них уже в архиве до этого запуска: ${known}.`,
    '',
    `- скачано сейчас: ${tally.fetched} (${formatBytes(tally.bytes)})`,
    `- уже лежали в архиве: ${tally.already}`,
    `- старый сайт не ответил (404): ${tally.dead}`,
    `- больше предельного размера: ${tally.tooBig}`,
    `- сбоев связи: ${tally.failed.length}`,
    '',
    `В архиве всего: файлов ${archiveStats().assets}, ${formatBytes(archiveStats().assetBytes)}.`,
  ];
  if (tally.dead) lines.push('', 'Список того, что осталось без файла — в `assets-dead.md`, по материалам.');
  if (tally.failed.length) {
    lines.push('', '## Сбои связи', '', ...tally.failed.map((row) => `- ${row.url} — ${row.why}`));
  }
  return `${lines.join('\n')}\n`;
}

/**
 * A missing file is not a missing text: the draft keeps the old address and this list says which
 * material still depends on the old site, so a person can fetch the file by hand and attach it in
 * the panel. One line per address, grouped under the material that asked for it.
 */
function missingReport(
  ledger: Map<string, LedgerEntry>,
  wanted: Map<string, string[]>,
  journal: Map<string, AssetRecord>,
  missing: string[],
): string {
  const why = (url: string): string => {
    const record = journal.get(url);
    if (!record) return 'не успели скачать';
    if (record.status === 404) return 'на старом сайте файла больше нет';
    if (record.status === 413) return 'файл больше, чем принимает Медиатека';
    return `старый сайт ответил ${record.status}`;
  };

  const byMaterial = new Map<string, string[]>();
  for (const url of missing) {
    for (const key of wanted.get(url) ?? []) byMaterial.set(key, [...(byMaterial.get(key) ?? []), url]);
  }

  const lines = [
    '# Файлы, оставшиеся на старом сайте',
    '',
    `Из ${wanted.size} ссылок на файлы без файла остались ${missing.length}, в ${byMaterial.size} материалах.`,
    'Черновик с такой ссылкой показывает картинку со старого сайта, пока файл не приложен вручную.',
  ];
  for (const [key, urls] of [...byMaterial.entries()].sort((a, b) => (ledger.get(a[0])?.title ?? '').localeCompare(ledger.get(b[0])?.title ?? ''))) {
    const entry = ledger.get(key);
    if (!entry) continue;
    lines.push('', `## ${entry.title}`, '', `Новый адрес: ${entry.newPath}`, '', ...urls.map((url) => `- ${why(url)}: ${url}`));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const retryDead = process.argv.includes('--retry-dead');
  const limit = Number.parseInt(argument('limit', '0'), 10) || 0;
  const delayMs = Number.parseInt(argument('delay', String(DEFAULT_DELAY_MS)), 10) || DEFAULT_DELAY_MS;

  const wanted = pendingAssets(loadLedger());
  if (!wanted.size) {
    console.log('В журналах переноса нет ни одной ссылки на файл — сначала выполните import-drafts.ts');
    return;
  }

  const journal = loadAssets();
  const queue = [...wanted.keys()].filter((url) => {
    // A stored file is never asked for twice, and an answer that depends on the file rather than on
    // the day is kept too: `--retry-dead` is there for the ones a night of bad connection decided.
    const record = journal.get(url);
    if (!record) return true;
    return retryDead && record.status !== 200;
  });
  const held = [...wanted.keys()].filter((url) => journal.get(url)?.status === 200).length;
  console.log(`ссылок в текстах: ${wanted.size} | уже в архиве: ${held} | качать: ${queue.length}`);
  console.log(`пауза ${delayMs} мс → около ${Math.round((queue.length * delayMs) / 60000)} минут${limit ? ` | ограничение: ${limit}` : ''}`);
  if (dryRun) {
    for (const url of queue.slice(0, 12)) console.log('  качать:', url);
    return;
  }

  const tally: Tally = { fetched: 0, bytes: 0, already: held, dead: 0, tooBig: 0, failed: [] };
  const batch = limit > 0 ? queue.slice(0, limit) : queue;

  for (let index = 0; index < batch.length; index += 1) {
    const url = batch[index] ?? '';
    try {
      const result = await fetchBytes(url, limitFor(url), { delayMs });
      if (result.status === 200 && result.data.byteLength) {
        saveAsset(result.data, url, result.contentType, result.status, 'pass-3');
        tally.fetched += 1;
        tally.bytes += result.data.byteLength;
      } else if (result.status === 404) {
        // The absence is journaled as well, so a rerun does not ask the old site about a dead
        // address again; the text keeps pointing at it and the report tells staff which one.
        saveAsset(Buffer.alloc(0), url, result.contentType, 404, 'pass-3');
        tally.dead += 1;
      } else if (result.status === 413) {
        saveAsset(Buffer.alloc(0), url, result.contentType, 413, 'pass-3');
        tally.tooBig += 1;
      } else {
        tally.failed.push({ url, why: `ответ ${result.status}` });
      }
    } catch (error) {
      tally.failed.push({ url, why: error instanceof Error ? error.message.slice(0, 160) : String(error) });
    }

    if ((index + 1) % 25 === 0 || index + 1 === batch.length) {
      console.log(
        `${index + 1}/${batch.length} · скачано ${tally.fetched} (${formatBytes(tally.bytes)}) · нет на сайте ${tally.dead} · сбои ${tally.failed.length}`,
      );
    }
  }

  const after = loadAssets();
  const missing = [...wanted.keys()].filter((url) => after.get(url)?.status !== 200);
  const dir = path.join(ARCHIVE, 'inventory');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'assets-fetch.md'), report(tally, wanted.size, tally.already), 'utf8');
  writeFileSync(path.join(dir, 'assets-dead.md'), missingReport(loadLedger(), wanted, after, missing), 'utf8');

  console.log(`скачано: ${tally.fetched} | нет на сайте: ${tally.dead} | слишком велики: ${tally.tooBig} | сбои: ${tally.failed.length}`);
  console.log(`без файла осталось ссылок: ${missing.length}`);
  console.log(`отчёт: ${path.join(dir, 'assets-fetch.md')}`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
