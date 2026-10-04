import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHIVE, loadPages, readPage, sha1, type PageRecord } from './archive';
import { classify } from './links';
import { parseArchivePage, type ParsedMaterial } from './parse';
import { htmlToPlainText } from '../../../src/lib/content/sanitize-rules';

/** One language version of one material, with every old address that serves the same text. */
export interface InventoryRow {
  /** Stable identity of this material version: the content itself, because the old site serves the
   *  same article under a dozen nested menu paths. */
  key: string;
  url: string;
  lang: string;
  source: 'k2' | 'joomla';
  id?: number;
  title: string;
  categoryId?: number;
  categoryLabel: string;
  /** The first segment of the address, which is the only section a com_content page carries. */
  section: string;
  printedDate: string;
  publishedAt: string | null;
  excerpt: string;
  bodyChars: number;
  words: number;
  bodyHtml: string;
  fileUrls: string[];
  pageUrls: string[];
  externalUrls: string[];
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  /** Other addresses of the same text; each one still needs a redirect to the new material. */
  aliases: string[];
  /** The address says one language, the letters say another — a person has to look at it. */
  langDoubt: string;
}

export interface Inventory {
  rows: InventoryRow[];
  /** Archived addresses that looked like a material but yielded nothing — every one is a possible loss. */
  unreadable: { url: string; lang: string; bytes: number }[];
  duplicates: number;
  listingPages: number;
}

const INVENTORY_DIR = path.join(ARCHIVE, 'inventory');

export function inventoryPath(name: string): string {
  return path.join(INVENTORY_DIR, name);
}

/**
 * The identity of a material is its text, not its address: Joomla answers the same article under
 * every nested menu path that leads to it (`/ru/otdeli/biblioteka/9-explore/256-…`), and K2 items
 * appear under both a language prefix and the menu alias. Keying on the address would import one
 * page up to twenty-nine times.
 */
function contentKey(row: Pick<InventoryRow, 'title' | 'bodyHtml'>): string {
  return sha1(`${row.title}||${row.bodyHtml.replace(/\s+/g, ' ').trim()}`);
}

/** Which language the letters themselves speak, used only to settle a contested duplicate. */
function scriptLang(text: string): string {
  const cyrillic = (text.match(/[\u0400-\u04ff]/g) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  if (cyrillic + latin < 20) return '';
  if (cyrillic > (text.length * 0.05)) {
    return /[қғҳўЎҚҒҲ]/.test(text) ? 'uz' : 'ru';
  }
  return /[‘ʼ’']/.test(text) || /\b(va|bilan|uchun|bo‘limi|ilmiy)\b/i.test(text) ? 'uz' : 'en';
}

/** The address we call canonical: the shortest one, and the one whose prefix speaks the material's
 *  language — the old site served the same Uzbek page under `/uz/…` and the menu alias `/en-ca/…`. */
function betterCandidate(a: InventoryRow, b: InventoryRow): InventoryRow {
  const depth = (row: InventoryRow) => new URL(row.url).pathname.split('/').filter(Boolean).length;
  const score = (row: InventoryRow) => `${langPrefixOf(row.url) === row.lang ? 0 : 1}${String(depth(row)).padStart(2, '0')}`;
  if (score(a) !== score(b)) return score(a) < score(b) ? a : b;
  return a.url < b.url ? a : b;
}

function langPrefixOf(url: string): string {
  const first = new URL(url).pathname.split('/').filter(Boolean)[0] ?? '';
  return first === 'en-ca' ? 'uz' : first;
}

/** The section a person recognises: the menu word of the address, with Joomla's plumbing removed. */
function sectionOf(url: string): string {
  const noise = /^(component|k2|item|item-\d+|category|content|article|com_content|list-page\d*|start)$/i;
  const parts = new URL(url).pathname.split('/').filter(Boolean).slice(1);
  return parts.find((part) => !noise.test(part) && !/^\d/.test(part)) ?? parts[0] ?? '';
}

function row(material: ParsedMaterial): InventoryRow {
  const text = htmlToPlainText(material.bodyHtml);
  return {
    // Filled in by collectInventory, which is the only place that sees every copy of the text.
    key: '',
    url: material.url,
    lang: material.lang,
    source: material.source,
    id: material.id,
    title: material.title,
    categoryId: material.categoryId,
    categoryLabel: material.categoryLabel,
    section: sectionOf(material.url),
    printedDate: material.printedDate,
    publishedAt: material.publishedAt,
    excerpt: material.excerpt,
    bodyChars: material.bodyHtml.length,
    words: text ? text.split(' ').filter(Boolean).length : 0,
    bodyHtml: material.bodyHtml,
    fileUrls: material.fileUrls,
    pageUrls: material.pageUrls,
    externalUrls: material.externalUrls,
    seoTitle: material.seoTitle,
    seoDescription: material.seoDescription,
    keywords: material.keywords,
    aliases: [],
    langDoubt: '',
  };
}

/** Reads every archived page once and keeps one row per distinct material. */
export function collectInventory(): Inventory {
  const kept = new Map<string, InventoryRow>();
  const unreadable: Inventory['unreadable'] = [];
  let duplicates = 0;
  let listingPages = 0;

  for (const record of loadPages().values()) {
    if (record.status !== 200) continue;
    const kind = classify(record.url).kind;
    if (kind === 'k2-category' || kind === 'k2-user') {
      listingPages += 1;
      continue;
    }
    if (kind !== 'k2-item' && kind !== 'article') continue;

    const html = readPage(record.sha);
    if (!html) {
      unreadable.push({ url: record.url, lang: record.lang ?? 'und', bytes: 0 });
      continue;
    }
    const material = parseArchivePage(html, record.url, record.lang ?? 'und');
    if (!material) {
      unreadable.push({ url: record.url, lang: record.lang ?? 'und', bytes: html.length });
      continue;
    }

    const rowValue = row(material);
    rowValue.key = contentKey(rowValue);
    rowValue.langDoubt = doubt(rowValue);

    const previous = kept.get(rowValue.key);
    if (!previous) {
      kept.set(rowValue.key, rowValue);
      continue;
    }
    duplicates += 1;
    // Every address that served the text is remembered, so a 301 can be written for each of them.
    const winner = betterCandidate(previous, rowValue);
    const losers = previous === winner ? [rowValue] : [previous];
    winner.aliases = [...new Set([...previous.aliases, ...rowValue.aliases, ...losers.map((l) => l.url)])];
    winner.lang = winner.lang || scriptLang(`${winner.title} ${htmlToPlainText(winner.bodyHtml)}`);
    kept.set(winner.key, winner);
  }

  return {
    rows: [...kept.values()].sort((a, b) => a.key.localeCompare(b.key)),
    unreadable: unreadable.sort((a, b) => b.bytes - a.bytes),
    duplicates,
    listingPages,
  };
}

/** The prefix of an address is the menu's claim about language; the letters are the fact. */
function doubt(row: InventoryRow): string {
  const spoken = scriptLang(`${row.title} ${htmlToPlainText(row.bodyHtml)}`);
  if (!spoken || spoken === row.lang) return '';
  return `адрес: ${row.lang}, текст: ${spoken}`;
}

export function writeInventory(inventory: Inventory): { materials: string; notes: string } {
  mkdirSync(INVENTORY_DIR, { recursive: true });
  const materials = inventoryPath('materials.jsonl');
  // One line per material: the file is re-read by the importer and by anyone checking a number.
  writeFileSync(materials, inventory.rows.map((r) => jsonLine(r)).join('\n') + '\n', 'utf8');
  const notes = inventoryPath('notes.md');
  writeFileSync(notes, describeInventory(inventory), 'utf8');
  return { materials, notes };
}

function jsonLine(row: InventoryRow): string {
  const { bodyHtml, ...rest } = row;
  return JSON.stringify({ ...rest, body: bodyHtml });
}

/** What `writeInventory` stored, read back by the importer so a rerun never re-parses the archive. */
export function loadMaterials(): InventoryRow[] {
  const file = inventoryPath('materials.jsonl');
  if (!existsSync(file)) return [];
  const rows: InventoryRow[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as InventoryRow & { body?: string };
      rows.push({ ...parsed, bodyHtml: parsed.body ?? '' });
    } catch {
      // A torn line only means the run was cut short; the file is rewritten in full next time.
    }
  }
  return rows;
}

function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of rows) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
}

function table(counts: Map<string, number>, header: string): string {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return [`| ${header} | материалов |`, '|---|---|', ...sorted.map(([k, n]) => `| ${k} | ${n} |`)].join('\n');
}

export function describeInventory(inventory: Inventory): string {
  const { rows } = inventory;
  const byCategory = new Map<string, { labels: Map<string, number>; langs: Map<string, number>; n: number }>();
  for (const r of rows) {
    const key = r.categoryId ? `#${r.categoryId}` : `${r.section || '(нет рубрики)'}`;
    const e = byCategory.get(key) ?? { labels: new Map(), langs: new Map(), n: 0 };
    e.n += 1;
    if (r.categoryLabel) e.labels.set(r.categoryLabel, (e.labels.get(r.categoryLabel) ?? 0) + 1);
    e.langs.set(r.lang, (e.langs.get(r.lang) ?? 0) + 1);
    byCategory.set(key, e);
  }

  const files = new Map<string, number>();
  for (const r of rows) for (const url of r.fileUrls) files.set(domainOf(url), (files.get(domainOf(url)) ?? 0) + 1);

  const lines = [
    `# Инвентарь архива beruni.uz — ${new Date().toISOString().slice(0, 16)} `,
    '',
    `- материалов: **${rows.length}**`,
    `- источников: ${fmt(countBy(rows, (r) => r.source))}`,
    `- языков: ${fmt(countBy(rows, (r) => r.lang))}`,
    `- дат в тексте: ${rows.filter((r) => r.publishedAt).length}`,
    `- одинаковый текст под разными адресами: ${inventory.duplicates} строк сведено в один материал`,
    `- страниц-полок (не материалы): ${inventory.listingPages}`,
    `- вложений: ${rows.reduce((n, r) => n + r.fileUrls.length, 0)}, внешних ссылок: ${rows.reduce((n, r) => n + r.externalUrls.length, 0)}`,
    '',
    '## Рубрики',
    '',
    '| рубрика | материалов | метки | языки |',
    '|---|---|---|---|',
    ...[...byCategory.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([key, e]) => `| ${key} | ${e.n} | ${fmt(e.labels)} | ${fmt(e.langs)} |`),
    '',
    '## Куда ведут вложения',
    '',
    table(files, 'хост'),
    '',
    '## Тонкие материалы (проверить руками)',
    '',
    ...rows
      .filter((r) => r.words < 20)
      .map((r) => `- ${r.lang} «${r.title}» — ${r.words} слов, ${r.fileUrls.length} файлов, ${r.url}`),
    '',
    '## Язык адреса не совпадает с языком текста (проверить руками)',
    '',
    ...rows
      .filter((r) => r.langDoubt)
      .map((r) => `- ${r.langDoubt} · «${r.title.slice(0, 60)}» · ${r.url}`),
    '',
    '## Материалы под несколькими старыми адресами',
    '',
    ...rows
      .filter((r) => r.aliases.length)
      .sort((a, b) => b.aliases.length - a.aliases.length)
      .map((r) => `- ${r.lang} «${r.title.slice(0, 50)}» → ${r.url} +${r.aliases.length}\n${r.aliases.map((a) => `    ${a}`).join('\n')}`),
    '',
    '## Адреса, которые не удалось разобрать',
    '',
    ...inventory.unreadable.map((r) => `- ${r.lang} ${r.bytes} Б ${r.url}`),
  ];
  return lines.join('\n') + '\n';
}

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(не адрес)';
  }
}

function fmt(counts: Map<string, number>): string {
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ');
}
