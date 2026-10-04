'use client';

import { useActionState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { signIn } from '../actions';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function LoginForm({
  nextPath,
  signedOut,
  labels,
  devHint,
}: {
  nextPath: string;
  signedOut: boolean;
  labels: { email: string; password: string; submit: string; signedOut?: string };
  devHint?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signIn, INITIAL_ACTION_STATE);

  return (
    <div className="space-y-6">
      {signedOut && labels.signedOut ? (
        <Alert className="border-border bg-muted/50">
          <AlertDescription className="text-muted-foreground">{labels.signedOut}</AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="next" value={nextPath} />

        <div className="space-y-2">
          <Label htmlFor="email">{labels.email}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            placeholder="name@beruni.uz"
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{labels.password}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Lock />}
          {labels.submit}
        </Button>
      </form>

      {devHint ? <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{devHint}</p> : null}
    </div>
  );
}
