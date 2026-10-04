import { cn } from '@/lib/utils';
import type { AdminLocale } from '@/lib/admin/i18n';

const LOCALES: { code: AdminLocale; label: string }[] = [
  { code: 'ru', label: 'RU' },
  { code: 'en', label: 'EN' },
  { code: 'uz', label: 'UZ' },
];

/**
 * Changes the admin interface language only. The public site keeps serving whatever
 * language the visitor chooses — this cookie never touches it.
 */
export function LocaleSwitcher({
  locale,
  action,
  className,
}: {
  locale: AdminLocale;
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
}) {
  return (
    <form action={action} className={cn('shrink-0', className)}>
      <div className="flex items-center gap-0.5 rounded-lg border p-0.5" role="group" aria-label="Interface language">
        {LOCALES.map((option) => (
          <button
            key={option.code}
            type="submit"
            name="locale"
            value={option.code}
            aria-pressed={option.code === locale}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              option.code === locale
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </form>
  );
}
