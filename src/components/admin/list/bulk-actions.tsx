'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BulkBarLabels } from '@/lib/admin/labels';

/** Both controls sit inside the material-list <form>, so they find it by walking up the DOM. */
function boxesOf(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[data-bulk-id]'));
}

export function BulkSelectAll({ label }: { label: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = ref.current;
    const form = input?.closest('form');
    if (!form || !input) return;

    const sync = () => {
      const boxes = boxesOf(form);
      const picked = boxes.filter((box) => box.checked).length;
      input.indeterminate = picked > 0 && picked < boxes.length;
      input.checked = picked > 0 && picked === boxes.length;
    };

    sync();
    form.addEventListener('change', sync);
    return () => form.removeEventListener('change', sync);
  }, []);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      onChange={(event) => {
        const form = event.currentTarget.closest('form');
        if (!form) return;
        for (const box of boxesOf(form)) box.checked = event.currentTarget.checked;
        form.dispatchEvent(new Event('change', { bubbles: true }));
      }}
    />
  );
}

export interface BulkActionOption {
  value: string;
  label: string;
}

export function BulkBar({
  labels,
  actions,
  categories,
}: {
  labels: BulkBarLabels;
  actions: BulkActionOption[];
  categories: { value: string; label: string }[];
}) {
  const [action, setAction] = useState('');
  const [picked, setPicked] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const form = ref.current?.closest('form');
    if (!form) return;
    const sync = () => setPicked(form.querySelectorAll('input[data-bulk-id]:checked').length);
    sync();
    form.addEventListener('change', sync);
    return () => form.removeEventListener('change', sync);
  }, []);

  return (
    <div ref={ref} hidden={picked === 0} className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
      <span className="whitespace-nowrap text-sm font-medium tabular-nums">
        {labels.selected}: {picked}
      </span>

      {/* Nothing in here is `required`: the bar is hidden until rows are picked, and browsers
          refuse to submit a form holding an unfocusable invalid control. The action itself
          re-validates on the server. */}
      <select
        name="action"
        aria-label={labels.actions}
        value={action}
        onChange={(event) => setAction(event.target.value)}
        className="h-9 min-w-44 rounded-md border border-input bg-transparent px-2 text-sm"
      >
        <option value="" disabled>
          {labels.actions}…
        </option>
        {actions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {action === 'moveCategory' ? (
        <select name="categoryId" aria-label={labels.moveCategory} defaultValue="" className="h-9 min-w-40 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="" disabled>
            {labels.pickCategory}
          </option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {action === 'addTag' ? (
        <input name="tag" aria-label={labels.addTag} maxLength={80} placeholder={labels.tagName} className="h-9 w-44 rounded-md border border-input bg-transparent px-2 text-sm" />
      ) : null}

      <Button type="submit" size="sm" className="ml-auto">
        <Send />
        {labels.run}
      </Button>
    </div>
  );
}
