'use client';

import { useActionState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { confirmTwoFactor } from '../../actions';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function VerifyForm({
  nextPath,
  labels,
}: {
  nextPath: string;
  labels: { submit: string };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(confirmTwoFactor, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />

      <div className="space-y-2">
        <Label htmlFor="token" className="sr-only">
          {labels.submit}
        </Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className="h-12 text-center text-xl tracking-[0.5em] tabular-nums"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        {labels.submit}
      </Button>
    </form>
  );
}
