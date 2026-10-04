'use client';

import { useEffect, useActionState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { confirmTwoFactorSetup, disableTwoFactor } from './actions';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CODE_CLASS =
  'h-11 w-40 text-center font-medium tracking-[0.35em] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export function TwoFactorSetupForm({ labels }: { labels: { code: string; submit: string } }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(confirmTwoFactorSetup, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="code">{labels.code}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className={CODE_CLASS}
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        {labels.submit}
      </Button>
    </form>
  );
}

export function TwoFactorDisableForm({ labels }: { labels: { code: string; submit: string } }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(disableTwoFactor, INITIAL_ACTION_STATE);
  const refreshed = useRef<ActionState | null>(null);

  useEffect(() => {
    if (!state.ok || refreshed.current === state) return;
    refreshed.current = state;
    router.replace('/admin/security?off=1');
    router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="disable-code" className="text-xs text-muted-foreground">
          {labels.code}
        </Label>
        <Input
          id="disable-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          className={CODE_CLASS}
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {labels.submit}
      </Button>
      {state.error ? <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p> : null}
    </form>
  );
}
