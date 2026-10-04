import { readFileSync } from 'node:fs';
import { collectInventory, inventoryPath, writeInventory } from './lib/inventory';

/**
 * Turns the raw archive into the list of materials the migration works from:
 * `inventory/materials.jsonl` for the writer, `inventory/notes.md` for a person.
 */
function run(): void {
  if (process.argv.includes('--print')) {
    console.log(readFileSync(inventoryPath('notes.md'), 'utf8'));
    return;
  }

  const started = Date.now();
  const inventory = collectInventory();
  const written = writeInventory(inventory);
  console.log(describeSummary(inventory));
  console.log(`\n${written.materials}`);
  console.log(`${written.notes}`);
  console.log(`за ${((Date.now() - started) / 1000).toFixed(0)} с`);
}

function describeSummary(inventory: ReturnType<typeof collectInventory>): string {
  const langs = new Map<string, number>();
  for (const row of inventory.rows) langs.set(row.lang, (langs.get(row.lang) ?? 0) + 1);
  return [
    `материалов: ${inventory.rows.length}`,
    `языки: ${[...langs.entries()].map(([l, n]) => `${l}=${n}`).join(' ')}`,
    `совпавших текстов: ${inventory.duplicates}`,
    `полок (не материалы): ${inventory.listingPages}`,
    `не разобрано: ${inventory.unreadable.length}`,
  ].join(' | ');
}

run();
