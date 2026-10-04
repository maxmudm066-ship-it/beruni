/**
 * Order handling shared by the two drag-and-drop screens (menu items, homepage blocks).
 *
 * The browser only ever sends the visible order — a list of ids plus how deep each row is
 * indented. Turning that into parent links and positions happens here, on the server, so a
 * hand-crafted payload cannot move a row into another menu, build a cycle or nest too deep.
 */

/** Visual row: identity plus indentation, in the order the user sees them. */
export interface OrderRow {
  id: string;
  depth: number;
}

/** Top level, a sub-item, and one level inside a wide panel — deeper is never rendered. */
export const MENU_MAX_DEPTH = 2;

/** Persisted position of one row. */
export interface OrderEntry {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/** A hand-sent payload is refused above this size; no real menu or page comes close. */
const MAX_ROWS = 500;

/**
 * Walks the visible list once and derives each row's parent (the nearest row above it that is
 * indented one level less) and its position among its siblings. Indentation that no row above
 * can support is pulled back to a level that does.
 */
export function rowsToEntries(rows: readonly OrderRow[], maxDepth: number): OrderEntry[] {
  const stack: OrderRow[] = [];
  const positions = new Map<string | null, number>();
  const entries: OrderEntry[] = [];

  for (const row of rows) {
    const previous = stack.length ? stack[stack.length - 1] : undefined;
    const depth = Math.max(0, Math.min(maxDepth, previous ? Math.min(row.depth, previous.depth + 1) : 0));

    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].id : null;

    const position = positions.get(parentId) ?? 0;
    positions.set(parentId, position + 1);
    entries.push({ id: row.id, parentId, sortOrder: position });

    stack.push({ id: row.id, depth });
  }

  return entries;
}

/**
 * Validates a submitted order against the ids that really belong to this list.
 * Returns null when the payload is unusable — the caller then changes nothing.
 */
export function parseOrderPayload(
  raw: FormDataEntryValue | null | undefined,
  validIds: ReadonlySet<string>,
  maxDepth: number,
): OrderEntry[] | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_ROWS) return null;

  const rows: OrderRow[] = [];
  const seen = new Set<string>();
  for (const value of parsed) {
    if (!value || typeof value !== 'object') return null;
    const { id, depth } = value as Record<string, unknown>;
    if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) return null;
    seen.add(id);
    const level = typeof depth === 'number' && Number.isInteger(depth) ? depth : 0;
    rows.push({ id, depth: Math.max(0, Math.min(maxDepth, level)) });
  }

  // A partial list would silently renumber the rows it left out, so all of them must be present.
  if (seen.size !== validIds.size) return null;

  return rowsToEntries(rows, maxDepth);
}

/** Flat lists (homepage blocks) use the same payload with nesting switched off. */
export function parseFlatOrderPayload(
  raw: FormDataEntryValue | null | undefined,
  validIds: ReadonlySet<string>,
): OrderEntry[] | null {
  return parseOrderPayload(raw, validIds, 0);
}
