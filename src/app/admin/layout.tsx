import type { Metadata } from 'next';
import '@/app/globals.css';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getAdminLocale, localeOf, translate } from '@/lib/admin/i18n';
import { getSessionUser } from '@/lib/auth/session';
import { rootClassName } from '@/lib/fonts';

// The browser tab is the one panel string a worker sees without opening a screen, so it follows
// the same language rule as the interface: cookie first, then the saved account preference.
export async function generateMetadata(): Promise<Metadata> {
  const user = await getSessionUser();
  const locale = await getAdminLocale(localeOf(user?.language));

  return {
    title: { absolute: translate(locale, 'admin.panelTitle') },
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Root layout of the panel: it owns <html> so that lang matches the language the person is
 * actually working in. Screen readers, spell-checking and browser translation all read it.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const locale = await getAdminLocale(localeOf(user?.language));

  return (
    <html lang={locale} className={rootClassName}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </body>
    </html>
  );
}
