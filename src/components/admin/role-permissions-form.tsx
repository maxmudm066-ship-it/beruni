'use client';

import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface PermissionCell {
  permission: string;
  label: string;
  checked: boolean;
}

export interface RoleMatrix {
  columns: { action: string; label: string }[];
  rows: { typeKey: string; label: string; cells: PermissionCell[] }[];
  systemGroups: { title: string; items: PermissionCell[] }[];
}

export function RolePermissionsForm({
  roleKey,
  matrix,
  labels,
  action,
  readOnly = false,
}: {
  roleKey: string;
  matrix: RoleMatrix;
  labels: { save: string; note: string; saved: string };
  /** Absent for roles that cannot be edited — the matrix is then display-only. */
  action?: (state: ActionState, formData: FormData) => Promise<ActionState>;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const displayOnly = readOnly || !action;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action ?? (async (previous: ActionState) => previous),
    INITIAL_ACTION_STATE,
  );
  const handled = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="roleKey" value={roleKey} />

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">{labels.note}</TableHead>
              {matrix.columns.map((column) => (
                <TableHead key={column.action} className="text-center text-xs font-medium">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrix.rows.map((row) => (
              <TableRow key={row.typeKey}>
                <TableCell className="text-sm font-medium">{row.label}</TableCell>
                {row.cells.map((cell) => (
                  <TableCell key={cell.permission} className="text-center">
                    <Checkbox
                      name="permissions"
                      value={cell.permission}
                      defaultChecked={cell.checked}
                      disabled={displayOnly}
                      className="mx-auto"
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {matrix.systemGroups.map((group) => (
          <fieldset key={group.title} className="rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">{group.title}</legend>
            <div className="space-y-2.5">
              {group.items.map((item) => (
                <label key={item.permission} className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    name="permissions"
                    value={item.permission}
                    defaultChecked={item.checked}
                    disabled={displayOnly}
                    className="mt-0.5"
                  />
                  <span className="text-muted-foreground">{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{labels.saved}</p> : null}

      {displayOnly ? null : (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {labels.save}
          </Button>
        </div>
      )}
    </form>
  );
}
