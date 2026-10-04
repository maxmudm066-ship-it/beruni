import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/auth/session';
import { getAdminLocale, translate, type AdminLocale, type TranslationKey } from '@/lib/admin/i18n';
import { formatDateTime } from '@/lib/admin/format';
import { MESSAGE_STAGES, MESSAGE_STAGE_ACTIONS, MESSAGE_STAGE_STATUSES, type MessageStage } from '@/lib/admin/messages';
import { PageHeader } from '@/components/admin/page-header';
import { StatusPill } from '@/components/admin/status-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { setMessageStage } from '../actions';
import { MESSAGE_NOTICES } from '../notices';

/**
 * One message from the site: the full text, the address to answer to, and the marks that keep the
 * inbox tidy. Nothing is sent from here — the panel only records what a person did.
 */
export default async function MessagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission('contact_messages.manage');
  const locale = await getAdminLocale(user.language as AdminLocale);
  const t = (key: TranslationKey) => translate(locale, key);
  const { id } = await params;
  const query = await searchParams;
  const noticeKey = typeof query.notice === 'string' ? query.notice : '';
  const notice = MESSAGE_NOTICES[noticeKey] ? t(MESSAGE_NOTICES[noticeKey]) : '';

  const message = await prisma.contactMessage.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      subject: true,
      message: true,
      lang: true,
      stage: true,
      ip: true,
      createdAt: true,
      updatedAt: true,
      handledBy: { select: { displayName: true } },
    },
  });
  if (!message) notFound();

  const current = message.stage as MessageStage;
  const back = `/admin/messages/${message.id}`;
  const mailto = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject || t('messages.noSubject')}`)}`;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader title={message.subject || t('messages.noSubject')} description={`${t('messages.from')}: ${message.name}`} />

      {notice ? (
        <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <Link href="/admin/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" />
        {t('messages.back')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">{t('messages.text')}</CardTitle>
            <StatusPill status={message.stage} label={t(MESSAGE_STAGE_STATUSES[current])} />
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.message}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              {t('messages.received')}: {formatDateTime(message.createdAt, locale)}
            </p>
            {message.handledBy ? (
              <p className="text-xs text-muted-foreground">
                {t('messages.handledBy')}: {message.handledBy.displayName} · {formatDateTime(message.updatedAt, locale)}
              </p>
            ) : null}
            {user.permissions.includes('*') && message.ip ? (
              <p className="mt-2 font-mono text-xs text-muted-foreground">{message.ip}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('messages.email')}</p>
                <p className="break-all font-medium">{message.email}</p>
              </div>
              {message.phone ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t('messages.phone')}</p>
                  <p className="font-medium">{message.phone}</p>
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground">{t('messages.language')}</p>
                <p className="font-medium uppercase">{message.lang}</p>
              </div>
              <Button asChild size="sm" variant="outline" className="w-full">
                <a href={mailto}>
                  <Mail />
                  {t('messages.reply')}
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('common.status')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {MESSAGE_STAGES.filter((key) => key !== current).map((key) => (
                <form key={key} action={setMessageStage}>
                  <input type="hidden" name="id" value={message.id} />
                  <input type="hidden" name="stage" value={key} />
                  <input type="hidden" name="back" value={back} />
                  <Button type="submit" size="sm" variant="outline">
                    {t(MESSAGE_STAGE_ACTIONS[key])}
                  </Button>
                </form>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
