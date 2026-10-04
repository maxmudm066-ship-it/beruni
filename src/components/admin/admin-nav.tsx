'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { ADMIN_NAV_GROUPS, DASHBOARD_ENTRY, type NavEntry } from '@/lib/admin/nav';
import { translate, type AdminLocale } from '@/lib/admin/labels';
import { visibleNavSections } from '@/lib/rbac';

export function AdminNav({
  permissions,
  roleKey,
  locale,
}: {
  permissions: string[];
  roleKey: string;
  locale: AdminLocale;
}) {
  const pathname = usePathname();
  const visible = visibleNavSections({ roleKey, permissions });

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

  function renderEntry(entry: NavEntry) {
    const label = translate(locale, entry.labelKey);
    return (
      <SidebarMenuItem key={entry.section}>
        <SidebarMenuButton asChild isActive={isActive(entry.href)} tooltip={label}>
          <Link href={entry.href}>
            <entry.icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => visible.has(entry.section)),
  })).filter((group) => group.entries.length > 0);

  return (
    <>
      {visible.has('dashboard') ? (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>{renderEntry(DASHBOARD_ENTRY)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {groups.map((group) => (
        <SidebarGroup key={group.titleKey}>
          <SidebarGroupLabel>{translate(locale, group.titleKey)}</SidebarGroupLabel>
          <SidebarMenu>{group.entries.map(renderEntry)}</SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
