'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { INITIAL_ACTION_STATE, type ActionState } from '@/lib/admin/action-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface UserFormValues {
  displayName: string;
  email: string;
  username: string;
  roleId: string;
  language: string;
  status: string;
}

export interface UserFormLabels {
  displayName: string;
  email: string;
  username: string;
  role: string;
  language: string;
  status: string;
  tempPassword: string;
  tempPasswordHint: string;
  save: string;
  cancel: string;
  usernameHint: string;
}

export function UserForm({
  action,
  values,
  roles,
  languages,
  statuses,
  labels,
  userId,
  showStatus,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values: UserFormValues;
  roles: { id: string; name: string }[];
  languages: { code: string; name: string }[];
  statuses: { value: string; label: string }[];
  labels: UserFormLabels;
  userId?: string;
  showStatus: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, INITIAL_ACTION_STATE);
  const handled = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.ok && handled.current !== state) {
      handled.current = state;
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-5">
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="displayName">{labels.displayName}</Label>
          <Input id="displayName" name="displayName" defaultValue={values.displayName} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{labels.email}</Label>
          <Input id="email" name="email" type="email" defaultValue={values.email} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">{labels.username}</Label>
          <Input id="username" name="username" defaultValue={values.username} required />
          <p className="text-xs text-muted-foreground">{labels.usernameHint}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleId">{labels.role}</Label>
          <Select name="roleId" defaultValue={values.roleId}>
            <SelectTrigger id="roleId" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">{labels.language}</Label>
          <Select name="language" defaultValue={values.language}>
            <SelectTrigger id="language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((language) => (
                <SelectItem key={language.code} value={language.code}>
                  {language.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showStatus ? (
          <div className="space-y-2">
            <Label htmlFor="status">{labels.status}</Label>
            <Select name="status" defaultValue={values.status}>
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {!showStatus ? (
          <div className="space-y-2">
            <Label htmlFor="password">{labels.tempPassword}</Label>
            <Input id="password" name="password" type="text" required minLength={10} defaultValue="" />
            <p className="text-xs text-muted-foreground">{labels.tempPasswordHint}</p>
          </div>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {labels.save}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {labels.cancel}
        </Button>
      </div>
    </form>
  );
}
