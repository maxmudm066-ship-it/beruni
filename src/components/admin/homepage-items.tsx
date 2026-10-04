'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { BlockChoice } from '@/lib/admin/homepage-items';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface HomepageItemsLabels {
  search: string;
  add: string;
  remove: string;
  up: string;
  down: string;
  empty: string;
  noneFound: string;
  limit: string;
}

/**
 * Which materials a homepage block shows, and in what order.
 *
 * The list is the block's own: a colleague who chooses items decides them for every language at
 * once, and the site then shows each one only where it is published and translated. Leaving the list
 * empty hands the block back to its own kind of material, which is what most blocks want.
 */
export function HomepageItems({
  items,
  options,
  max,
  typeLabels,
  labels,
}: {
  items: BlockChoice[];
  options: BlockChoice[];
  max: number;
  typeLabels: Record<string, string>;
  labels: HomepageItemsLabels;
}) {
  const [rows, setRows] = useState<BlockChoice[]>(items);
  const [query, setQuery] = useState('');

  const chosen = useMemo(() => new Set(rows.map((row) => row.groupId)), [rows]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = options.filter((option) => !chosen.has(option.groupId));
    return (needle ? list.filter((option) => option.title.toLowerCase().includes(needle)) : list).slice(0, 40);
  }, [options, chosen, query]);

  const move = (index: number, step: number) => {
    const target = index + step;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  };

  return (
    <div className="space-y-4">
      {rows.length ? (
        <ol className="divide-y rounded-md border bg-background">
          {rows.map((row, index) => (
            <li key={row.groupId} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{typeLabels[row.typeKey] ?? row.typeKey}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                title={labels.up}
                aria-label={labels.up}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                title={labels.down}
                aria-label={labels.down}
                disabled={index === rows.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                title={labels.remove}
                aria-label={labels.remove}
                onClick={() => setRows(rows.filter((entry) => entry.groupId !== row.groupId))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">{labels.empty}</p>
      )}

      <div className="space-y-1.5">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.search}
          aria-label={labels.search}
          className="h-8 max-w-sm text-sm"
        />
        {visible.length ? (
          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
            {visible.map((option) => (
              <li key={option.groupId}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50"
                  disabled={rows.length >= max}
                  title={rows.length >= max ? labels.limit : labels.add}
                  onClick={() => setRows([...rows, option])}
                >
                  <Plus className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{option.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {typeLabels[option.typeKey] ?? option.typeKey}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{labels.noneFound}</p>
        )}
      </div>

      <input type="hidden" name="items" value={JSON.stringify(rows.map((row) => row.groupId))} />
    </div>
  );
}
