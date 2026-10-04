import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { PENDING_COOKIE, readPendingTicket } from '@/lib/auth/pending';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { cookies } from 'next/headers';
import { setAdminLocale } from '../../actions';
import { VerifyForm } from './verify-form';
import { LocaleSwitcher } from '@/components/admin/locale-switcher';

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const store = await cookies();
  const userId = readPendingTicket(store.get(PENDING_COOKIE)?.value);
  if (!userId) redirect('/admin/login');

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
  if (!user) redirect('/admin/login');

  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith('/admin') && !params.next.startsWith('//') ? params.next : '/admin';

  const locale = await getAdminLocale('ru');

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{translate(locale, 'twoFactor.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{translate(locale, 'twoFactor.hint')}</p>
          </div>
          <LocaleSwitcher locale={locale} action={setAdminLocale} />
        </div>

        <p className="mb-5 truncate rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{user.email}</p>

        <VerifyForm nextPath={nextPath} labels={{ submit: translate(locale, 'twoFactor.submit') }} />

        <Link href="/admin/login" className="mt-4 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
          {locale === 'ru' ? 'Отмена' : locale === 'uz' ? 'Bekor qilish' : 'Cancel'}
        </Link>
      </div>
    </main>
  );
}
