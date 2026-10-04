/**
 * The shapes the public pages repeat, written once.
 *
 * A heading, a rule and a button appear on the homepage, in a section, on an article and in the
 * footer. Kept here they cannot drift apart into five slightly different blues, which is what makes a
 * site look assembled rather than designed. The colours themselves are the tokens of `.site` in
 * `globals.css`; only the arrangement lives in this file.
 */

/** A short brass line: it marks a heading the way a rubric marked a manuscript. */
export const RULE = 'h-px w-12 shrink-0 bg-brass';

/** The small line above a heading that says what kind of page this is. */
export const KICKER = 'text-xs font-semibold uppercase tracking-[0.18em] text-brass-deep';

export const SECTION_HEADING = 'font-heading text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]';

export const PAGE_HEADING = 'font-heading text-3xl font-semibold leading-tight tracking-tight sm:text-[40px] sm:leading-[1.15]';

export const BUTTON_PRIMARY =
  'inline-flex items-center justify-center bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-deep';

export const BUTTON_SECONDARY =
  'inline-flex items-center justify-center border border-ink/30 px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-parchment';

/** On a photograph the frame is the only thing that keeps a button readable. */
export const BUTTON_ON_IMAGE =
  'inline-flex items-center justify-center border border-white/60 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-white hover:bg-white/15';

export const BUTTON_ON_IMAGE_PRIMARY =
  'inline-flex items-center justify-center bg-brass px-5 py-2.5 text-sm font-semibold text-ink-deep transition-colors hover:bg-white';

/** A link inside running text: underlined, in the manuscript's two colours. */
export const BODY_LINK = 'text-ink underline decoration-brass decoration-1 underline-offset-[3px] hover:decoration-2';

/** A link that leads onward to a whole section, so it carries the rule with it. */
export const ARROW_LINK =
  'group inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-ink-deep';

export const FIELD =
  'w-full border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brass-deep focus:ring-1 focus:ring-brass-deep';
