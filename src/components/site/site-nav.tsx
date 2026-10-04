'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { PublicNavItem } from '@/lib/site/menus';
import { cn } from '@/lib/utils';

/**
 * The site navigation. On a wide screen the items run across their own row under the institute's
 * name (`SiteNavBar`); on a narrow one they fold into a panel over the page (`SiteNav`). One list of
 * items drives both, so a menu edited in the panel cannot appear in one and be missing from the other.
 */
export function SiteNavBar({ items, menuLabel }: { items: PublicNavItem[]; menuLabel: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={menuLabel} className="hidden lg:block">
      <ul className="flex flex-wrap items-center gap-x-1">
        {items.map((item) => (
          <DesktopItem key={item.id} item={item} pathname={pathname} top />
        ))}
      </ul>
    </nav>
  );
}

export function SiteNav({
  items,
  menuLabel,
  closeLabel,
}: {
  items: PublicNavItem[];
  menuLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 border border-ink/25 px-3 py-2 text-sm font-medium text-ink-deep transition-colors hover:border-ink hover:bg-parchment lg:hidden"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {menuLabel}
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
          <span className="h-px w-4 bg-current" />
        </span>
      </button>

      {open ? (
        <nav
          aria-label={menuLabel}
          className="absolute inset-x-0 top-full z-40 max-h-[70vh] overflow-y-auto border-t border-border bg-background px-4 py-3 lg:hidden"
        >
          <MobileList items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
          <button type="button" className="mt-4 text-sm font-medium text-ink-deep underline decoration-brass underline-offset-4" onClick={() => setOpen(false)}>
            {closeLabel}
          </button>
        </nav>
      ) : null}
    </>
  );
}

/**
 * One item of the wide-screen bar, together with the items stored under it — to any depth.
 *
 * Which flyout is open is decided for each item on its own, so a third level does not appear while
 * the pointer is still on the second. The items are kept in the page even when hidden, because a
 * section a visitor cannot reach is still a page of this site.
 */
function DesktopItem({ item, pathname, top = false }: { item: PublicNavItem; pathname: string; top?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <NavLink item={item} block={!top} active={isActive(item, pathname)} variant={top ? 'bar' : 'flyout'} />
      {item.children.length ? (
        <ul
          className={cn(
            'absolute z-40 min-w-60 border border-border border-t-2 border-t-brass bg-background p-1 shadow-lg transition-opacity',
            top ? 'left-0 top-full' : 'left-full top-0',
            open ? 'visible opacity-100' : 'invisible opacity-0',
          )}
        >
          {item.children.map((child) => (
            <DesktopItem key={child.id} item={child} pathname={pathname} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * A link of the menu, in the two shapes the bar needs.
 *
 * A top-level item sits on the rule under the header, so its mark is a brass line drawn along that
 * rule. An item inside a flyout has no rule to sit on and is marked the way a list is — a parchment
 * ground.
 */
function NavLink({
  item,
  block = false,
  active = false,
  variant = 'flyout',
  onNavigate,
}: {
  item: PublicNavItem;
  block?: boolean;
  active?: boolean;
  variant?: 'bar' | 'flyout';
  onNavigate?: () => void;
}) {
  const className = cn(
    'text-sm transition-colors',
    variant === 'bar'
      ? cn(
          'relative inline-flex items-center px-3 py-2 font-medium',
          active ? 'text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-brass' : 'text-ink-deep/90 hover:text-ink after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-brass after:origin-left after:scale-x-0 after:transition-transform hover:after:scale-x-100',
        )
      : cn('block px-3 py-2', active ? 'bg-parchment font-medium text-ink' : 'text-ink-deep/90 hover:bg-accent hover:text-ink'),
    block && 'w-full',
  );
  if (/^https?:/i.test(item.href)) {
    return (
      <a
        href={item.href}
        target={item.openInNewTab ? '_blank' : undefined}
        rel="noopener noreferrer"
        className={className}
        onClick={onNavigate}
      >
        {item.title}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      {item.title}
    </Link>
  );
}

function MobileList({
  items,
  pathname,
  onNavigate,
  depth = 0,
}: {
  items: PublicNavItem[];
  pathname: string;
  onNavigate: () => void;
  depth?: number;
}) {
  return (
    <ul className={cn('divide-y divide-border/70 border-y border-border/70', depth > 0 && 'ml-3 border-l-2 border-l-brass/60 border-y-0 pl-3')}>
      {items.map((item) => (
        <li key={item.id}>
          <NavLink item={item} block active={isActive(item, pathname)} onNavigate={onNavigate} />
          {item.children.length ? (
            <MobileList items={item.children} pathname={pathname} onNavigate={onNavigate} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function isActive(item: PublicNavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return item.children.some((child) => isActive(child, pathname));
}
