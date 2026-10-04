'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { GripVertical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReorderRow {
  id: string;
  /** Indentation level: 0 is top level, 1 is a sub-item, and so on. */
  depth: number;
  /** Rendered on the server — the row's text, links and its own quick-action forms. */
  content: ReactNode;
}

export interface ReorderLabels {
  drag: string;
  saving: string;
  list: string;
}

const INDENT_PX = 22;

function SavingNote({ label }: { label: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      {label}
    </p>
  );
}

/**
 * Drag-and-drop ordering for menu items and homepage blocks.
 *
 * The rows themselves stay server-rendered: this component only owns the visual order and posts
 * it back through one hidden field. Each row keeps its own plain forms for the up/down buttons,
 * so the list also works without a mouse and without JavaScript — which is why the ordering form
 * is a sibling of the list rather than a wrapper (nesting forms is not allowed in HTML).
 */
export function ReorderList({
  rows,
  maxDepth,
  action,
  context,
  labels,
}: {
  rows: ReorderRow[];
  maxDepth: number;
  action: (formData: FormData) => Promise<void>;
  /** Extra hidden fields the action needs, such as which menu is being edited. */
  context?: Record<string, string>;
  labels: ReorderLabels;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [items, setItems] = useState(rows);
  const [shown, setShown] = useState(rows);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // A drop paints the new order immediately, but the server has the final say: whenever it sends a
  // fresh list (reordered, renamed, hidden, or in another language) that list replaces the local one.
  if (shown !== rows) {
    setShown(rows);
    setItems(rows);
  }

  const commit = (next: ReorderRow[]) => {
    setItems(next);
    setDragging(null);
    setOver(null);
    const field = formRef.current?.querySelector<HTMLInputElement>('input[name="order"]');
    if (!field) return;
    field.value = JSON.stringify(next.map(({ id, depth }) => ({ id, depth: Math.min(depth, maxDepth) })));
    formRef.current?.requestSubmit();
  };

  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = items.findIndex((row) => row.id === dragging);
    const to = items.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    // Dragging downwards shifts every row up by one, so the target index has to follow.
    next.splice(from < to ? to - 1 : to, 0, { ...moved, depth: items[to].depth });
    commit(next);
  };

  return (
    <>
      <form ref={formRef} action={action} className="mb-2">
        <input type="hidden" name="order" defaultValue="" />
        {Object.entries(context ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SavingNote label={labels.saving} />
      </form>

      <ul aria-label={labels.list} className="space-y-1.5">
        {items.map((row) => (
          <li
            key={row.id}
            onDragOver={(event) => {
              if (!dragging || dragging === row.id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (over !== row.id) setOver(row.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dropOn(row.id);
            }}
            className={cn(dragging === row.id && 'opacity-40')}
          >
            <div
              style={{ marginLeft: row.depth * INDENT_PX }}
              className={cn(
                'flex items-start gap-2 rounded-lg border bg-card p-2.5',
                over === row.id && dragging !== row.id && 'border-primary ring-1 ring-primary/30',
              )}
            >
              <span
                draggable
                title={labels.drag}
                aria-label={labels.drag}
                className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
                onDragStart={(event) => {
                  setDragging(row.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', row.id);
                  const card = event.currentTarget.parentElement;
                  if (card) event.dataTransfer.setDragImage(card, 24, 16);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
              >
                <GripVertical className="size-4" />
              </span>
              <div className="min-w-0 flex-1">{row.content}</div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
