import { LaptopMinimal, LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { requireUser, listActiveSessions } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { formatDateTime, formatRelative } from '@/lib/admin/format';
import { describeUserAgent } from '@/lib/admin/user-agent';
import { revokeAllOtherSessions, revokeSession } from '../../actions';
import { PageHeader } from '@/components/admin/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default async function SessionsPage() {
  const user = await requireUser();
  const locale = await getAdminLocale(user.language as 'ru' | 'en' | 'uz');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const sessions = await listActiveSessions(user.id);
  const others = sessions.filter((session) => session.id !== user.sessionId);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('sessions.title')}
        description={t('sessions.description')}
        actions={
          others.length > 0 ? (
            <form action={revokeAllOtherSessions}>
              <Button variant="outline" size="sm" type="submit">
                <LogOut />
                {t('sessions.revokeOthers')}
              </Button>
            </form>
          ) : null
        }
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sessions.device')}</TableHead>
                <TableHead>{t('sessions.ip')}</TableHead>
                <TableHead>{t('sessions.lastSeen')}</TableHead>
                <TableHead>{t('sessions.signedIn')}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => {
                const isCurrent = session.id === user.sessionId;
                return (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        {isCurrent ? (
                          <LaptopMinimal className="size-4 text-muted-foreground" />
                        ) : (
                          <MonitorSmartphone className="size-4 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{describeUserAgent(session.userAgent)}</p>
                          {session.twoFactorVerified ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                              <ShieldCheck className="size-3" />
                              2FA
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">{session.ip ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatRelative(session.lastSeenAt, locale)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(session.createdAt, locale)}</TableCell>
                    <TableCell className="text-right">
                      {isCurrent ? (
                        <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                          {t('sessions.current')}
                        </span>
                      ) : (
                        <form action={revokeSession}>
                          <input type="hidden" name="sessionId" value={session.id} />
                          <Button variant="ghost" size="sm" type="submit">
                            <LogOut />
                            {t('sessions.revoke')}
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {t('sessions.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
