import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  approved: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  scheduled: 'bg-violet-500/12 text-violet-700 dark:text-violet-400',
  published: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  archived: 'bg-stone-500/15 text-stone-600 dark:text-stone-400',
  processing: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  ready: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  new: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  read: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  replied: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-destructive/12 text-destructive',
  active: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  invited: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  suspended: 'bg-destructive/12 text-destructive',
};

/** Colour-coded label for any admin status. Callers pass the already-translated text. */
export function StatusPill({ status, label, className }: { status: string; label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap',
        TONE[status] ?? 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
