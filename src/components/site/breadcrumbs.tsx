import Link from 'next/link';

export interface Crumb {
  title: string;
  href?: string;
}

/**
 * Where a page sits in the site.
 *
 * The trail is built from the address the visitor used, so a manuscript reached through the digitised
 * shelf says so — which is also how `<html lang>` and the menus already behave.
 */
export function Breadcrumbs({ rows }: { rows: Crumb[] }) {
  const items = rows.filter((row) => row.title);
  if (items.length < 2) return null;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {items.map((row, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${row.href ?? row.title}-${index}`} className="flex items-center gap-2.5">
              {row.href && !last ? (
                <Link href={row.href} className="underline-offset-4 hover:text-ink hover:underline hover:decoration-brass">
                  {row.title}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'text-ink-deep' : ''}>
                  {row.title}
                </span>
              )}
              {!last ? (
                <span aria-hidden className="h-px w-3 bg-brass" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
