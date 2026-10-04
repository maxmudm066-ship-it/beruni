'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SITE_LOCALE_COOKIE, SITE_LOCALE_COOKIE_MAX_AGE } from '@/lib/site/cookie';
import { cn } from '@/lib/utils';

export interface SwitcherLanguage {
  code: string;
  /** Always the name of the language written in that language: Uzbek, Русский, English. */
  label: string;
}

/**
 * Swaps the language prefix of the current address. A page that knows the translations of its own
 * material passes them in, otherwise the same path under another prefix is used — the two cases
 * agree because every material address is /<code>/…
 *
 * `tone` is which band of the header it sits on: the contacts bar is dark, the brand bar is light,
 * and the same control has to stay readable on both.
 */
export function LanguageSwitcher({
  languages,
  current,
  alternates,
  label,
  tone = 'light',
}: {
  languages: SwitcherLanguage[];
  current: string;
  alternates?: Record<string, string> | undefined;
  label: string;
  tone?: 'light' | 'dark';
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    document.addEventListener('click', close);
    return () => {
      window.removeEventListener('keydown', close);
      document.removeEventListener('click', close);
    };
  }, [open]);

  const hrefFor = (code: string) => {
    const explicit = alternates?.[code];
    if (explicit) return explicit;
    const rest = pathname.replace(/^\/[^/]+/, '');
    return `/${code}${rest || ''}`;
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
          tone === 'dark'
            ? 'border-white/25 text-white/85 hover:border-brass hover:text-white'
            : 'border-border text-ink-deep hover:border-ink hover:text-ink',
        )}
      >
        <span>{current}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={cn('size-3 transition-transform', open && 'rotate-180')}>
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open ? (
        <ul className="absolute right-0 z-50 mt-1 min-w-36 border border-border bg-background p-1 shadow-lg">
          {languages.map((language) => (
            <li key={language.code}>
              <Link
                href={hrefFor(language.code)}
                // `/` has to offer a language before it knows what the visitor wants; a click here is
                // what tells it, and the value is written where the redirect handler can read it back.
                onClick={() => {
                  document.cookie = `${SITE_LOCALE_COOKIE}=${language.code}; path=/; max-age=${SITE_LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
                }}
                className={cn(
                  'block px-2 py-1.5 text-sm hover:bg-accent',
                  language.code === current && 'font-semibold text-ink',
                )}
              >
                {language.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
