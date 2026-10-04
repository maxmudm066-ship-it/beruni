/**
 * What a letter from a visitor has to look like.
 *
 * The limits live here because both ends of the form read them: the page puts them on the inputs so
 * a person sees the boundary while typing, and the action applies them again to whatever arrives,
 * since anything can be posted to a server.
 */
import type { SiteKey } from './dictionary';

export const CONTACT_NAME_MAX = 120;
export const CONTACT_EMAIL_MAX = 150;
export const CONTACT_PHONE_MAX = 60;
export const CONTACT_SUBJECT_MAX = 200;
export const CONTACT_MESSAGE_MIN = 3;
export const CONTACT_MESSAGE_MAX = 4000;

/** The field no person fills in. It is named like a form a script would look for. */
export const CONTACT_HONEYPOT = 'website';

export type ContactProblem = 'name' | 'email' | 'message' | 'tooMany';

/** The sentence the page shows when a letter was refused, in the language of the visitor. */
export const CONTACT_PROBLEM_KEYS: Record<ContactProblem, SiteKey> = {
  name: 'contact.problemName',
  email: 'contact.problemEmail',
  message: 'contact.problemMessage',
  tooMany: 'contact.problemTooMany',
};

/** A `?bad=` parameter may be typed by anyone, so it is checked before it names a message. */
export function isContactProblem(value: string): value is ContactProblem {
  return value in CONTACT_PROBLEM_KEYS;
}

/** An address a reply can actually go to: one name, one at, one dot after the at. */
const EMAIL = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\.]+(\.[^\s@,;<>()[\]\\.]+)+$/i;

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Control characters are dropped, newlines and tabs are not: a letter is shown to a person in the
 * panel with the paragraphs the visitor pressed, and those have to survive.
 */
function cleaned(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function capped(raw: string, limit: number): string {
  return cleaned(raw).slice(0, limit);
}

export interface ContactValues {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export type ContactRead =
  /** A script that filled the honeypot: nothing is stored and nothing is told it. */
  | { ok: true; bot: true; values: ContactValues }
  | { ok: true; bot: false; values: ContactValues }
  | { ok: false; problem: ContactProblem };

export function readContactMessage(formData: FormData): ContactRead {
  const values: ContactValues = {
    name: capped(field(formData, 'name'), CONTACT_NAME_MAX),
    email: capped(field(formData, 'email'), CONTACT_EMAIL_MAX),
    phone: capped(field(formData, 'phone'), CONTACT_PHONE_MAX),
    subject: capped(field(formData, 'subject'), CONTACT_SUBJECT_MAX),
    message: capped(field(formData, 'message'), CONTACT_MESSAGE_MAX),
  };

  if (cleaned(field(formData, CONTACT_HONEYPOT))) return { ok: true, bot: true, values };
  if (values.name.length < 2) return { ok: false, problem: 'name' };
  if (!EMAIL.test(values.email)) return { ok: false, problem: 'email' };
  if (values.message.length < CONTACT_MESSAGE_MIN) return { ok: false, problem: 'message' };
  return { ok: true, bot: false, values };
}

/**
 * The page the letter was posted from, so the answer can be shown where the visitor wrote it.
 * Only a path of this site is accepted: a form must not become a door to another place, and the
 * panel is not a place a visitor is sent to.
 */
export function contactReturnPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.length > 200) return null;
  if (path.includes('..') || path.includes('\\') || /\s|\u0000/.test(path)) return null;
  if (path === '/admin' || path.startsWith('/admin/')) return null;
  return path;
}

/** The language of that page, read from its address; anything else is not a language of this site. */
export function languageOfPath(path: string, codes: readonly string[]): string | null {
  const prefix = path.slice(1).split('/')[0];
  return codes.includes(prefix) ? prefix : null;
}
