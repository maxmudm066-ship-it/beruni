import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getAdminLocale, translate } from '@/lib/admin/i18n';
import { setAdminLocale } from '../actions';
import { LoginForm } from './login-form';
import { LocaleSwitcher } from '@/components/admin/locale-switcher';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; signedOut?: string; expired?: string }>;
}) {
  // The proxy already bounces anonymous visitors away from protected routes; this keeps
  // a signed-in user from landing back on the form after a browser refresh.
  if (await getSessionUser()) redirect('/admin');

  const params = await searchParams;
  const locale = await getAdminLocale('ru');
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const nextPath =
    params.next && params.next.startsWith('/admin') && !params.next.startsWith('//') ? params.next : '/admin';

  return (
    <main className="flex min-h-screen flex-1 flex-col lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-[oklch(0.24_0.055_258)] px-12 py-12 text-[oklch(0.94_0.01_85)] lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-[oklch(0.78_0.11_85)] font-heading text-lg font-semibold text-[oklch(0.22_0.03_60)]">
            B
          </span>
          <span className="text-sm font-medium tracking-wide">Beruniy CMS</span>
        </div>

        <div className="max-w-md space-y-4">
          <h1 className="font-heading text-3xl leading-snug font-medium">
            O‘zbekiston Respublikasi Fanlar akademiyasi
            <span className="mt-1 block text-[oklch(0.82_0.03_85)]">
              Abu Rayhon Beruniy nomidagi Sharqshunoslik instituti
            </span>
          </h1>
          <p className="text-sm leading-relaxed text-[oklch(0.86_0.02_250)]">
            Управление новостями, публикациями, рукописным каталогом, событиями и структурой
            института — без программирования и без доступа к серверу.
          </p>
        </div>

        <p className="text-xs text-[oklch(0.7_0.02_250)]">
          © {new Date().getFullYear()} Beruniy Institute of Oriental Studies
        </p>
      </aside>

      <section className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {locale === 'ru'
                  ? 'Войдите под своей учётной записью сотрудника.'
                  : locale === 'uz'
                    ? 'Xodim hisobingiz bilan kiring.'
                    : 'Use your institute staff account.'}
              </p>
            </div>
            <LocaleSwitcher locale={locale} action={setAdminLocale} />
          </div>

          <LoginForm
            nextPath={nextPath}
            signedOut={params.signedOut === '1' || params.expired === '1'}
            devHint={
              process.env.NODE_ENV === 'production'
                ? undefined
                : 'Development seed accounts — manager@ / editor@ / translator@ / media@ / viewer@beruni.uz with Demo1234!. admin@beruni.uz ships as ChangeMe123! and has to be replaced on the first sign-in.'
            }
            labels={{
              email: t('login.email'),
              password: t('login.password'),
              submit: t('login.submit'),
              signedOut:
                params.signedOut === '1' ? t('login.signedOut') : params.expired === '1' ? t('login.invalidToken') : undefined,
            }}
          />
        </div>
      </section>
    </main>
  );
}
