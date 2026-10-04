import { requireUser } from '@/lib/auth/session';
import { ADMIN_LOCALES, getAdminLocale, translate, type AdminLocale } from '@/lib/admin/i18n';
import { roleName } from '@/lib/admin/permission-labels';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { AdminNav } from '@/components/admin/admin-nav';
import { LocaleSwitcher } from '@/components/admin/locale-switcher';
import { UserMenu } from '@/components/admin/user-menu';
import { setAdminLocale, signOut } from '../actions';

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const fallback: AdminLocale = (ADMIN_LOCALES as readonly string[]).includes(user.language)
    ? (user.language as AdminLocale)
    : 'ru';
  const locale = await getAdminLocale(fallback);

  return (
    <SidebarProvider className="min-h-svh">
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="border-b">
          <div className="flex items-center gap-2.5 px-1 py-1 group-data-[collapsible=icon]:justify-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[oklch(0.24_0.055_258)] font-heading text-base font-semibold text-[oklch(0.82_0.11_85)]">
              B
            </span>
            <div className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">Beruniy CMS</span>
              <span className="truncate text-xs text-muted-foreground">{translate(locale, 'nav.dashboard')}</span>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <AdminNav permissions={user.permissions} roleKey={user.roleKey} locale={locale} />
        </SidebarContent>

        <SidebarSeparator className="my-0" />
        <SidebarFooter className="px-3 py-3 group-data-[collapsible=icon]:hidden">
          <p className="text-xs text-muted-foreground">
            {user.displayName}
            <span className="block">{roleName(user.roleKey, user.roleName, locale)}</span>
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-5">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 !h-5" />
          <span className="truncate font-heading text-sm font-medium">
            O‘zbekiston Fanlar akademiyasi · Sharqshunoslik instituti
          </span>
          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher locale={locale} action={setAdminLocale} />
            <UserMenu
              displayName={user.displayName}
              email={user.email}
              roleName={roleName(user.roleKey, user.roleName, locale)}
              labels={{
                sessions: translate(locale, 'nav.sessions'),
                password: translate(locale, 'nav.changePassword'),
                security: translate(locale, 'nav.security'),
                logout: translate(locale, 'nav.logout'),
              }}
              signOutAction={signOut}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
