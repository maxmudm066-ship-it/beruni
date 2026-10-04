import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { getSessionUser } from '@/lib/auth/session';
import { setAdminLocale } from '../actions';
import { LocaleSwitcher } from '@/components/admin/locale-switcher';
import { buttonVariants } from '@/components/ui/button';

export default async function NoAccessPage() {
  const user = await getSessionUser();
  const locale = await getAdminLocale(user?.language as 'ru' | 'en' | 'uz' ?? 'ru');

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <OctagonAlert className="size-5" />
        </span>

        <h1 className="text-xl font-semibold tracking-tight">{translate(locale, 'noAccess.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{translate(locale, 'noAccess.body')}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/admin" className={buttonVariants({ size: 'sm' })}>
            {translate(locale, 'nav.dashboard')}
          </Link>
          <LocaleSwitcher locale={locale} action={setAdminLocale} className="inline-flex" />
        </div>
      </div>
    </main>
  );
}
