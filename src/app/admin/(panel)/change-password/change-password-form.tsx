'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { changePassword } from '../../actions';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface PasswordLabels {
  current: string;
  next: string;
  confirm: string;
  hint: string;
  note: string;
  save: string;
  cancel: string;
  required: string;
  requiredBody: string;
}

export function ChangePasswordForm({ mustChange, labels }: { mustChange: boolean; labels: PasswordLabels }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePassword, INITIAL_ACTION_STATE);
  const handled = useRef<ActionState | null>(null);

  useEffect(() => {
    if (!state.next || handled.current === state) return;
    handled.current = state;
    router.replace(state.next);
    router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-6">
      {mustChange ? (
        <Alert>
          <KeyRound />
          <AlertTitle>{labels.required}</AlertTitle>
          <AlertDescription>{labels.requiredBody}</AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-5">
        <Field name="currentPassword" label={labels.current} autoComplete="current-password" />
        <Field name="newPassword" label={labels.next} autoComplete="new-password" hint={labels.hint} />
        <Field name="confirmPassword" label={labels.confirm} autoComplete="new-password" />

        {state.error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">{labels.note}</p>

        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {labels.save}
          </Button>
          {!mustChange ? (
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              {labels.cancel}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  autoComplete,
}: {
  name: string;
  label: string;
  hint?: string;
  autoComplete: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type="password" autoComplete={autoComplete} required className="h-11" />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
