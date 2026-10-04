/**
 * The 301 list of the transfer: every address the old site answered with a text, pointed at where
 * that text now lives.
 *
 * The ledger of the material pass holds one line per imported version, including the extra addresses
 * the same text was served under, so the list is written from the ledger alone and a rerun changes
 * nothing that is already correct. Rows are marked `origin: 'migration'`: a rule a person wrote by
 * hand in the Redirect Manager is never overwritten, and a rule the institute decides to switch off
 * in the panel stays off.
 *
 * The paths are kept exactly as `beruni.uz` printed them, percent-encoding included — that is the
 * string a visitor's browser sends, and the site matches an address character for character.
 *
 * Usage: npx tsx scripts/migrate/redirects.ts [--dry-run]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../../src/lib/db';
import { normalizeSource, normalizeTarget } from '../../src/lib/admin/redirect-path';
import { ARCHIVE } from './lib/archive';
import { loadLedger, redirectPairs, type LedgerEntry } from './lib/ledger';

const NOTE = 'Перенос со старого сайта beruni.uz';

/** The old home page was the Uzbek section; the new home picks the language, so it must not be cached. */
const OLD_HOME = { from: '/en-ca', to: '/', temporary: true };

interface Planned {
  sourcePath: string;
  targetPath: string;
  redirectType: 'permanent' | 'temporary';
  action: 'create' | 'update' | 'unchanged' | 'protected';
  /** What the row says now, for a rule that a person owns. */
  now?: { targetPath: string; origin: string };
}

const rejected: { from: string; why: string }[] = [];

function plan(
  pairs: { from: string; to: string; temporary?: boolean }[],
  existing: Map<string, { id: string; targetPath: string; redirectType: string; origin: string }>,
): Planned[] {
  const out: Planned[] = [];
  for (const pair of pairs) {
    const sourcePath = normalizeSource(pair.from);
    if (sourcePath === null) {
      rejected.push({ from: pair.from, why: 'адрес не читается как путь этого сайта' });
      continue;
    }
    const targetPath = normalizeTarget(pair.to);
    if (targetPath === null) {
      rejected.push({ from: pair.from, why: `новый адрес не читается как путь: ${pair.to}` });
      continue;
    }
    if (sourcePath.toLowerCase() === targetPath.toLowerCase()) {
      rejected.push({ from: pair.from, why: 'старый и новый адрес совпали' });
      continue;
    }

    const redirectType = pair.temporary ? 'temporary' : 'permanent';
    const row = existing.get(sourcePath);
    if (!row) {
      out.push({ sourcePath, targetPath, redirectType, action: 'create' });
      continue;
    }
    if (row.origin !== 'migration') {
      out.push({ sourcePath, targetPath: row.targetPath, redirectType: row.redirectType as Planned['redirectType'], action: 'protected', now: { targetPath: row.targetPath, origin: row.origin } });
      continue;
    }
    const same = row.targetPath === targetPath && row.redirectType === redirectType;
    out.push({ sourcePath, targetPath, redirectType, action: same ? 'unchanged' : 'update' });
  }
  return out;
}

function report(ledger: Map<string, LedgerEntry>, planned: Planned[], written: number, dryRun: boolean): string {
  const count = (action: Planned['action']) => planned.filter((row) => row.action === action).length;
  const aliases = [...ledger.values()].reduce((sum, entry) => sum + entry.aliases.length, 0);

  const lines = [
    '# 301-редиректы переноса',
    '',
    `Журнал переноса: ${ledger.size} материалов, из них дополнительных адресов: ${aliases}.`,
    '',
    `Правил в списке: ${planned.length + rejected.length}`,
    `${dryRun ? '- записано будет' : '- записано'}: ${written}`,
    `- новых: ${count('create')}`,
    `- исправлено: ${count('update')}`,
    `- уже верных: ${count('unchanged')}`,
    `- тронуть нельзя (правило принадлежит человеку): ${count('protected')}`,
    `- отклонено: ${rejected.length}`,
    '',
    'Тип у всех правил — постоянный (308), кроме старой главной страницы: она ведёт на `/`, где язык',
    'выбирается по настройкам браузера, и запоминать этот выбор навсегда было бы ошибкой.',
    '',
    'Перенесённые материалы пока черновики: адрес из правила начнёт открываться по мере того,',
    'как институт публикует их в панели. Пока текст не опубликован, переход ведёт на страницу 404.',
  ];

  if (rejected.length) {
    lines.push('', '## Отклонённые адреса', '', ...rejected.map((row) => `- \`${row.from}\` — ${row.why}`));
  }
  if (count('protected')) {
    lines.push(
      '',
      '## Правил, написанных вручную, перенос не тронул',
      '',
      ...planned
        .filter((row) => row.action === 'protected')
        .map((row) => `- \`${row.sourcePath}\` → \`${row.now?.targetPath ?? ''}\` (${row.now?.origin ?? ''})`),
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ledger = loadLedger();
  if (!ledger.size) {
    console.log('Журнал переноса пуст — сначала выполните npx tsx scripts/migrate/import-drafts.ts');
    return;
  }

  const pairs = [...redirectPairs(ledger), OLD_HOME];
  const existing = await prisma.redirect.findMany({
    select: { id: true, sourcePath: true, targetPath: true, redirectType: true, origin: true },
  });
  const bySource = new Map(existing.map((row) => [row.sourcePath, row]));
  const planned = plan(pairs, bySource);

  const by = (action: Planned['action']) => planned.filter((row) => row.action === action);
  console.log(`старых адресов: ${pairs.length} | правил в базе: ${existing.length}`);
  console.log(`новых: ${by('create').length} | исправлено: ${by('update').length} | верных: ${by('unchanged').length} | чужих: ${by('protected').length} | отклонено: ${rejected.length}`);
  for (const row of by('update')) console.log('  исправит:', row.sourcePath, '→', row.targetPath);
  for (const row of rejected) console.log('  отклонит:', row.from, '—', row.why);

  let written = 0;
  if (!dryRun) {
    for (const chunk of [by('create'), by('update')]) {
      for (let index = 0; index < chunk.length; index += 200) {
        const batch = chunk.slice(index, index + 200);
        await prisma.$transaction(
          batch.map((row) =>
            row.action === 'create'
              ? prisma.redirect.create({
                  data: {
                    sourcePath: row.sourcePath,
                    targetPath: row.targetPath,
                    redirectType: row.redirectType,
                    origin: 'migration',
                    note: row.redirectType === 'temporary' ? 'Старая главная страница' : NOTE,
                  },
                })
              : prisma.redirect.update({
                  where: { sourcePath: row.sourcePath },
                  data: { targetPath: row.targetPath, redirectType: row.redirectType },
                }),
          ),
        );
        written += batch.length;
      }
    }
    console.log(`правил записано: ${written} | всего в базе: ${await prisma.redirect.count()}`);
  }

  mkdirSync(path.join(ARCHIVE, 'inventory'), { recursive: true });
  const willWrite = by('create').length + by('update').length;
  writeFileSync(
    path.join(ARCHIVE, 'inventory', 'redirects.md'),
    report(ledger, planned, dryRun ? willWrite : written, dryRun),
    'utf8',
  );
  console.log(`отчёт: ${path.join(ARCHIVE, 'inventory', 'redirects.md')}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
