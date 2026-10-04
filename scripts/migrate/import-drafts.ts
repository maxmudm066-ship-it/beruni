import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHIVE } from './lib/archive';
import { loadMaterials, type InventoryRow } from './lib/inventory';
import { loadLedger, ledgerPath, rememberImport, type LedgerEntry } from './lib/ledger';
import { mapMaterial, type Mapping } from './lib/mapping';
import { writeDraft, type WriteOptions } from './lib/write';

/**
 * Pass 2: the archived text becomes a draft in the CMS.
 *
 * The inventory decides *what* exists, the mapping decides *where* it goes, and this file only runs
 * the list: nothing is written twice, because every material version is remembered in the ledger and
 * an interrupted import continues where it stopped. Draft status is deliberate — the institute checks
 * the transferred text itself before anything reaches the public site.
 *
 *   npx tsx scripts/migrate/import-drafts.ts --dry-run            # what would be written
 *   npx tsx scripts/migrate/import-drafts.ts --user=<логин>       # write it
 *   … --limit=20 --lang=uz --type=news                            # a bounded slice
 */

interface Options extends WriteOptions {
  user: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false, user: '', userId: '', changeSummary: CHANGE_SUMMARY };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [flag, value = ''] = arg.slice(2).split('=');
    if (flag === 'dry-run') options.dryRun = true;
    if (flag === 'user') options.user = value;
    if (flag === 'limit') options.limit = Number(value) || undefined;
    if (flag === 'lang') options.onlyLanguages = list(value);
    if (flag === 'type') options.onlyTypes = list(value);
  }
  return options;
}

const CHANGE_SUMMARY = 'Перенос со старого сайта beruni.uz: черновик, ждёт проверки института';

function list(value: string): string[] | undefined {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

interface Plan {
  row: InventoryRow;
  mapping: Mapping;
}

function select(candidates: Plan[], options: Options): Plan[] {
  let planned = candidates;
  if (options.onlyLanguages) planned = planned.filter((p) => options.onlyLanguages!.includes(p.row.lang));
  if (options.onlyTypes) planned = planned.filter((p) => options.onlyTypes!.includes(p.mapping.typeKey));
  if (options.limit) planned = planned.slice(0, options.limit);
  return planned;
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rows = loadMaterials();
  if (!rows.length) {
    console.error('Инвентарь пуст. Сначала: npx tsx scripts/migrate/inventory.ts');
    process.exitCode = 1;
    return;
  }

  const ledger = loadLedger();
  const fresh = rows.filter((row) => !ledger.has(row.key));
  const candidates = fresh.map((row) => ({ row, mapping: mapMaterial(row) }));
  const planned = select(candidates, options);
  console.log(`материалов: ${rows.length} | уже в журнале: ${rows.length - fresh.length} | к записи: ${planned.length}`);
  printCounts(candidates);
  printUnmapped(planned);

  if (options.dryRun) {
    // Run the real writer with its hand held back: the same sanitising, the same slug, the same path.
    const preview: LedgerEntry[] = [];
    for (const { row, mapping } of planned) preview.push(await writeDraft(row, mapping, { ...options, dryRun: true, userId: 'dry-run' }));
    console.log('\nпробег без записи: база не тронута.');
    printPaths(preview);
    return;
  }

  options.userId = await resolveUser(options.user);
  const started = Date.now();
  const failed: { row: InventoryRow; error: string }[] = [];
  let batch: LedgerEntry[] = [];
  let written = 0;

  for (const { row, mapping } of planned) {
    try {
      batch.push(await writeDraft(row, mapping, options));
      written += 1;
      if (batch.length >= 25) {
        rememberImport(batch);
        batch = [];
        console.log(`записано ${written}…`);
      }
    } catch (error) {
      failed.push({ row, error: error instanceof Error ? error.message : String(error) });
      console.error(`  сбой ${row.lang} «${short(row.title)}»: ${failed[failed.length - 1].error}`);
    }
  }
  rememberImport(batch);

  console.log(`\nчерновиков записано: ${written} | сбоев: ${failed.length} | за ${((Date.now() - started) / 1000).toFixed(0)} с`);
  console.log(`журнал: ${ledgerPath()}`);
  if (failed.length) {
    const file = path.join(ARCHIVE, 'inventory', 'pass2-failures.md');
    writeFileSync(file, ['# Сбои прохода 2', '', ...failed.map((f) => `- ${f.row.lang} ${f.row.url}\n  ${f.error}`)].join('\n') + '\n', 'utf8');
    console.log(`сбои: ${file}`);
  }
}

async function resolveUser(raw: string): Promise<string> {
  const { prisma } = await import('../../src/lib/db');
  const needle = raw.trim();
  if (!needle) throw new Error('нужен автор записей: --user=<логин администратора>');
  const found = needle.length > 12
    ? await prisma.user.findUnique({ where: { id: needle }, select: { id: true, displayName: true } })
    : await prisma.user.findUnique({ where: { username: needle }, select: { id: true, displayName: true } });
  if (!found) throw new Error(`администратор «${needle}» не найден`);
  console.log(`автор записей: ${found.displayName}`);
  return found.id;
}

function printCounts(planned: Plan[]): void {
  const byType = tally(planned, (p) => p.mapping.typeKey);
  console.log('\nпо типам:');
  for (const [type, n] of byType) console.log(`  ${type.padEnd(16)} ${n}`);
  console.log(`по языкам: ${[...tally(planned, (p) => p.row.lang)].map(([l, n]) => `${l}=${n}`).join(' ')}`);
}

function printUnmapped(planned: Plan[]): void {
  const unmapped = planned.filter((p) => p.mapping.why.startsWith('не распознано'));
  if (!unmapped.length) return;
  console.log(`\nбез точной рубрики: ${unmapped.length} (уйдут в «Beruniy.uz» до ручной правки)`);
  for (const p of unmapped.slice(0, 15)) console.log(`  ${p.row.lang} «${short(p.row.title)}» ${p.row.url}`);
}

function printPaths(planned: LedgerEntry[]): void {
  console.log('\nпервые адреса на новом сайте:');
  for (const entry of planned.slice(0, 12)) console.log(`  ${entry.typeKey.padEnd(14)} ${entry.lang} ${entry.newPath}  «${short(entry.title)}»`);
}

function tally<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) out.set(key(row), (out.get(key(row)) ?? 0) + 1);
  return new Map([...out.entries()].sort((a, b) => b[1] - a[1]));
}

function short(title: string): string {
  return title.length > 48 ? `${title.slice(0, 48)}…` : title;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
