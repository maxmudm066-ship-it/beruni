const LOCALE_TAG: Record<string, string> = { ru: 'ru-RU', en: 'en-GB', uz: 'uz-UZ' };

function tag(locale: string): string {
  return LOCALE_TAG[locale] ?? 'ru-RU';
}

export function formatDate(value: Date | null | undefined, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(tag(locale), { day: '2-digit', month: 'short', year: 'numeric' }).format(value);
}

export function formatDateTime(value: Date | null | undefined, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(tag(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function formatRelative(value: Date | null | undefined, locale: string, now = Date.now()): string {
  if (!value) return '—';
  const diffMinutes = Math.round((value.getTime() - now) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: 'auto' });
  const abs = Math.abs(diffMinutes);
  if (abs < 60) return rtf.format(diffMinutes, 'minute');
  if (abs < 60 * 24) return rtf.format(Math.round(diffMinutes / 60), 'hour');
  if (abs < 60 * 24 * 30) return rtf.format(Math.round(diffMinutes / 1440), 'day');
  return formatDate(value, locale);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
