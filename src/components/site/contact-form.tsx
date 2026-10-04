import { CONTACT_EMAIL_MAX, CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, CONTACT_NAME_MAX, CONTACT_PHONE_MAX, CONTACT_PROBLEM_KEYS, CONTACT_SUBJECT_MAX, CONTACT_HONEYPOT, isContactProblem } from '@/lib/site/contact-message';
import { siteLabeler } from '@/lib/site/dictionary';
import { sendContactMessage } from '@/app/(site)/actions';
import { BUTTON_PRIMARY, FIELD, RULE, SECTION_HEADING } from '@/components/site/styles';

const LABEL = 'block text-sm font-medium text-ink-deep';

/**
 * The letter a visitor writes to the institute.
 *
 * It is a plain form posting to the site itself, so it works in a browser that runs no scripts and in
 * one that refuses cookies: the answer to a submission comes back as a note in the address of this
 * page. Nothing here is sent to another service — the words land in the panel, in the inbox a
 * colleague reads.
 */
export function ContactForm({ lang, back, notice }: { lang: string; back: string; notice: string }) {
  const t = siteLabeler(lang);
  const sent = notice === 'sent';
  const problem = isContactProblem(notice) ? CONTACT_PROBLEM_KEYS[notice] : null;

  return (
    <section aria-labelledby="contact-form-title" className="border border-border bg-parchment/50 p-6 sm:p-10">
      <span aria-hidden className={RULE} />
      <h2 id="contact-form-title" className={`mt-4 ${SECTION_HEADING}`}>
        {t('contact.formTitle')}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t('contact.formIntro')}</p>

      {sent ? (
        <p role="status" className="mt-6 border-l-2 border-brass bg-background px-4 py-3 text-sm">
          {t('contact.sent')}
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="mt-6 border-l-2 border-destructive bg-background px-4 py-3 text-sm text-destructive">
          {t(problem)}
        </p>
      ) : null}

      <form action={sendContactMessage} className="mt-8 grid gap-5 sm:grid-cols-2">
        <input type="hidden" name="back" value={back} />

        <div className="space-y-1.5">
          <label htmlFor="contact-name" className={LABEL}>
            {t('contact.name')}
          </label>
          <input id="contact-name" name="name" required maxLength={CONTACT_NAME_MAX} autoComplete="name" className={FIELD} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-email" className={LABEL}>
            {t('contact.email')}
          </label>
          <input id="contact-email" name="email" type="email" required maxLength={CONTACT_EMAIL_MAX} autoComplete="email" className={FIELD} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-phone" className={LABEL}>
            {t('contact.phone')} <span className="font-normal text-muted-foreground">({t('contact.optional')})</span>
          </label>
          <input id="contact-phone" name="phone" maxLength={CONTACT_PHONE_MAX} autoComplete="tel" className={FIELD} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="contact-subject" className={LABEL}>
            {t('contact.subject')} <span className="font-normal text-muted-foreground">({t('contact.optional')})</span>
          </label>
          <input id="contact-subject" name="subject" maxLength={CONTACT_SUBJECT_MAX} className={FIELD} />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="contact-message" className={LABEL}>
            {t('contact.message')}
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            required
            minLength={CONTACT_MESSAGE_MIN}
            maxLength={CONTACT_MESSAGE_MAX}
            className={`${FIELD} resize-y`}
          />
        </div>

        {/* A field a person never sees and never fills: whatever writes into it is not a person. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor={CONTACT_HONEYPOT}>{CONTACT_HONEYPOT}</label>
          <input id={CONTACT_HONEYPOT} name={CONTACT_HONEYPOT} tabIndex={-1} autoComplete="off" />
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className={BUTTON_PRIMARY}>
            {t('contact.send')}
          </button>
        </div>
      </form>
    </section>
  );
}
