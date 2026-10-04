/**
 * Pass 1 of the migration: walk `beruni.uz` and keep a local copy of every page it answers.
 *
 * The site has no sitemap, so the crawl follows links instead: the three language homes seed the
 * frontier, and every page fetched adds the addresses it mentions. Because the frontier and the trail
 * of fetched pages both live in append-only journals inside the archive, stopping this script and
 * starting it again continues where it stopped — no state is kept in memory or in a database.
 *
 * Nothing is parsed into CMS content here. This pass only answers "do we have every page?", so the
 * import can read the archive afterwards: a wrong parser costs a re-read of local files, not a second
 * visit to the live site.
 */

import { BlockedError, DEFAULT_DELAY_MS, fetchPage, type PageResult } from './lib/http';
import {
  archiveStats,
  formatBytes,
  loadLinks,
  loadPages,
  rememberLinks,
  savePage,
  sha1,
  writeReport,
  type LinkRecord,
  type PageRecord,
} from './lib/archive';
import { classify, entryLanguage, extractLinks, isCrawlable, type ParsedUrl } from './lib/links';

const SEEDS = ['https://beruni.uz/', 'https://beruni.uz/en-ca/', 'https://beruni.uz/ru/', 'https://beruni.uz/en/'];

/** Structure before prose: a category listing reveals addresses the article on it does not. */
const LEAD_KINDS = new Set(['entry', 'article', 'k2-category', 'k2-user']);

interface QueueItem {
  page: ParsedUrl;
  from: string;
}

interface Options {
  max: number;
  sleepMs: number;
  lang: string;
  reportOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { max: 400, sleepMs: DEFAULT_DELAY_MS, lang: 'all', reportOnly: false };
  // Both `--max=100` and `--max 100` are accepted: this script is run by hand, often from memory.
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const inline = /^--([^=]+)=(.*)$/.exec(arg);
    if (inline) flags.set(inline[1], inline[2]);
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) flags.set(arg.slice(2), argv[++index]);
    else flags.set(arg.slice(2), 'true');
  }

  if (flags.get('report') === 'true') options.reportOnly = true;
  const max = Number(flags.get('max'));
  if (Number.isFinite(max) && max > 0) options.max = Math.floor(max);
  const sleep = Number(flags.get('sleep'));
  if (Number.isFinite(sleep) && sleep > 0) options.sleepMs = Math.max(300, Math.floor(sleep));
  const lang = flags.get('lang');
  if (lang) options.lang = lang;
  return options;
}

/**
 * One identity per page, however many menus point at it.
 *
 * The same K2 article is reachable under `/ru/component/k2/item/1057-…`, under the menu path housing
 * it, and from a homepage slider — three addresses, one text. The pagination offset belongs to the key
 * because a category listing is a different page for every `?start=`.
 */
function keyOf(candidate: ParsedUrl): string {
  const lang = candidate.lang || entryLanguage(candidate.url);
  if (candidate.id === undefined) return `${candidate.kind}:${lang}:${candidate.url}`;
  const start = new URL(candidate.url).searchParams.get('start') ?? '';
  return `${candidate.kind}:${candidate.id}:${lang}:${start}`;
}

function languageOf(candidate: ParsedUrl): string {
  return candidate.lang || entryLanguage(candidate.url) || 'und';
}

async function run(options: Options): Promise<void> {
  const pages = loadPages();
  const links = loadLinks();

  console.log(`archive: ${archiveStats().dir}`);
  console.log(`journals: ${pages.size} pages kept, ${links.size} addresses known`);
  if (options.reportOnly) {
    printStats(pages, links);
    return;
  }

  const seenKeys = new Set<string>();
  for (const record of pages.values()) seenKeys.add(keyOf(recordToCandidate(record)));

  const lead: QueueItem[] = [];
  const rest: QueueItem[] = [];
  const queuedKeys = new Set<string>();
  const queuedUrls = new Set<string>();

  const enqueue = (candidate: ParsedUrl, from: string): void => {
    if (!isCrawlable(candidate.kind)) return;
    if (queuedUrls.has(candidate.url)) return;
    if (options.lang !== 'all' && languageOf(candidate) !== options.lang) return;
    const key = keyOf(candidate);
    if (queuedKeys.has(key) || seenKeys.has(key)) return;
    queuedKeys.add(key);
    queuedUrls.add(candidate.url);
    (LEAD_KINDS.has(candidate.kind) ? lead : rest).push({ page: candidate, from });
  };

  for (const record of links.values()) enqueue(classify(record.url), record.from);
  for (const seed of SEEDS) {
    const candidate = classify(seed);
    if (!links.has(candidate.url)) {
      const record: LinkRecord = { url: candidate.url, kind: candidate.kind, lang: languageOf(candidate), from: 'seed', at: new Date().toISOString() };
      links.set(record.url, record);
      rememberLinks([record]);
    }
    enqueue(candidate, 'seed');
  }

  const queue = lead.length + rest.length;
  console.log(`frontier: ${queue} pages to read, ${options.max} this run, ${options.sleepMs} ms apart`);
  if (!queue) {
    console.log('nothing to do: every address in the journals has been read');
    printStats(pages, links);
    return;
  }

  const counters = { fetched: 0, byKind: new Map<string, number>(), byLang: new Map<string, number>(), dead: [] as string[], errors: [] as string[] };
  const started = Date.now();

  while (counters.fetched < options.max) {
    const next = lead.shift() ?? rest.shift();
    if (!next) break;

    let result: PageResult;
    try {
      result = await fetchPage(next.page.url, { delayMs: options.sleepMs });
    } catch (error) {
      if (error instanceof BlockedError) {
        counters.errors.push(`blocked: ${error.message}`);
        console.log(`! ${error.message} — stopping this run; the archive is intact and the next run resumes here`);
        break;
      }
      counters.errors.push(`${next.page.url}: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`! ${next.page.url} stayed unreachable, moving on`);
      continue;
    }

    const meta: Omit<PageRecord, 'at' | 'bytes'> = {
      url: next.page.url,
      sha: sha1(next.page.url),
      status: result.status,
      kind: next.page.kind,
      id: next.page.id,
      lang: languageOf(next.page),
      from: next.from,
    };
    const pageLang = meta.lang ?? 'und';
    pages.set(next.page.url, { ...meta, bytes: Buffer.byteLength(result.body), at: new Date().toISOString() });
    seenKeys.add(keyOf(next.page));
    if (result.dead) counters.dead.push(next.page.url);
    savePage(result.body, meta);

    const fresh: LinkRecord[] = [];
    for (const link of extractLinks(result.body, next.page.url)) {
      if (links.has(link.url)) {
        if (isCrawlable(link.kind)) enqueue(link, next.page.url);
        continue;
      }
      const record: LinkRecord = {
        url: link.url,
        kind: link.kind,
        id: link.id,
        lang: link.lang,
        from: next.page.url,
        at: new Date().toISOString(),
      };
      links.set(record.url, record);
      fresh.push(record);
      enqueue(link, next.page.url);
    }
    rememberLinks(fresh);

    counters.fetched += 1;
    bump(counters.byKind, next.page.kind, 1);
    bump(counters.byLang, pageLang, 1);

    if (counters.fetched === 1 || counters.fetched % 10 === 0) {
      const perMinute = counters.fetched / Math.max(0.001, (Date.now() - started) / 60000);
      console.log(
        `[${counters.fetched}/${options.max}] ${result.status} ${pageLang} ${next.page.kind} ${new URL(next.page.url).pathname}` +
          ` | +${fresh.length} addresses | queue ${lead.length + rest.length} | ${perMinute.toFixed(1)}/min`,
      );
    }
  }

  writeRunReport(counters, started, pages, links);
}

function recordToCandidate(record: PageRecord): ParsedUrl {
  return {
    url: record.url,
    path: new URL(record.url).pathname,
    search: new URL(record.url).search,
    lang: record.lang ?? '',
    kind: (record.kind as ParsedUrl['kind']) ?? 'other',
    id: record.id,
  };
}

function bump(map: Map<string, number>, key: string, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Addresses in the journals that no fetched page covers yet. */
function remaining(pages: Map<string, PageRecord>, links: Map<string, LinkRecord>): number {
  const covered = new Set<string>();
  for (const record of pages.values()) covered.add(keyOf(recordToCandidate(record)));
  let count = 0;
  for (const record of links.values()) {
    const candidate = classify(record.url);
    if (isCrawlable(candidate.kind) && !covered.has(keyOf(candidate))) count += 1;
  }
  return count;
}

function describe(pages: Map<string, PageRecord>, links: Map<string, LinkRecord>): string[] {
  const stats = archiveStats();
  const byKind = new Map<string, number>();
  const byLang = new Map<string, number>();
  const dead: string[] = [];
  for (const record of pages.values()) {
    bump(byKind, record.kind ?? '?', 1);
    bump(byLang, record.lang ?? '?', 1);
    if (record.status === 404) dead.push(record.url);
  }
  const assets = [...links.values()].filter((record) => record.kind === 'asset').length;
  return [
    `Archive: ${stats.pages} files (${formatBytes(stats.pageBytes)}) pages, ${stats.assets} files (${formatBytes(stats.assetBytes)}) at ${stats.dir}`,
    `Pages kept: ${pages.size} | addresses known: ${links.size} | of them files to download later: ${assets}`,
    `Still to read: ${remaining(pages, links)}`,
    `Kinds: ${[...byKind].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Languages: ${[...byLang].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Dead (404): ${dead.length}`,
    ...dead.slice(0, 30).map((url) => `  ${url}`),
  ];
}

function printStats(pages: Map<string, PageRecord>, links: Map<string, LinkRecord>): void {
  console.log(describe(pages, links).join('\n'));
}

function writeRunReport(
  counters: { fetched: number; byKind: Map<string, number>; byLang: Map<string, number>; dead: string[]; errors: string[] },
  started: number,
  pages: Map<string, PageRecord>,
  links: Map<string, LinkRecord>,
): void {
  const text = [
    `Crawl run ${new Date().toISOString()}`,
    `Read this run: ${counters.fetched} pages in ${(Date.now() - started) / 60000} min`,
    `By kind: ${[...counters.byKind].map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `By language: ${[...counters.byLang].map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `Dead this run: ${counters.dead.length}`,
    `Errors this run: ${counters.errors.length}`,
    ...counters.errors,
    '',
    ...describe(pages, links),
  ].join('\n');
  console.log(`\n${text}`);
  console.log(`report: ${writeReport('crawl', text)}`);
}

run(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
  console.error('crawl failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
