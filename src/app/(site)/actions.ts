'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { defaultSiteLanguage, siteLanguages } from '@/lib/site/languages';
import { contactReturnPath, languageOfPath, readContactMessage } from '@/lib/site/contact-message';

/**
 * How many letters one address may leave in an hour.
 *
 * A person who writes twice because they are unsure is not a flood, and a script that finds this
 * form is not going to get ten thousand rows into the inbox of a colleague who reads it by hand.
 */
const WINDOW_MINUTES = 60;
const MAX_PER_IP = 5;

async function visitorIp(): Promise<string> {
  const agent = await headers();
  return agent.get('x-forwarded-for')?.split(',')[0].trim() || agent.get('x-real-ip') || 'local';
}

/**
 * A letter from the site into the panel's inbox.
 *
 * A form posts here, which a browser may only do from this own site, so a third-party page cannot
 * put words in a visitor's name. What the visitor wrote is checked again here rather than trusted
 * from the browser, and the answer comes back to the same address as a note in the address bar, so
 * the form works with scripts turned off.
 */
export async function sendContactMessage(formData: FormData): Promise<void> {
  const back = contactReturnPath(formData.get('back')) ?? '/';
  const read = readContactMessage(formData);

  // A filled honeypot is thanked like a person: telling a script it was seen teaches it to hide better.
  if (read.ok && read.bot) redirect(`${back}?sent=1`);
  if (!read.ok) redirect(`${back}?bad=${read.problem}`);

  const ip = await visitorIp();
  // Letters are read one at a time by a person in the panel, and the count is bounded so a script
  // cannot make this page look through the whole inbox of one address.
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const recent = await prisma.contactMessage.findMany({ where: { ip, createdAt: { gte: since } }, select: { id: true }, take: MAX_PER_IP });
  if (recent.length >= MAX_PER_IP) redirect(`${back}?bad=tooMany`);

  const [codes, fallback] = await Promise.all([siteLanguages().then((rows) => rows.map((row) => row.code)), defaultSiteLanguage()]);
  await prisma.contactMessage.create({
    data: {
      name: read.values.name,
      email: read.values.email,
      message: read.values.message,
      // A field the visitor left empty is a field they did not fill in, not an empty sentence.
      phone: read.values.phone || null,
      subject: read.values.subject || null,
      lang: languageOfPath(back, codes) ?? fallback,
      ip,
      stage: 'new',
    },
  });

  redirect(`${back}?sent=1`);
}
