/**
 * Turning the text of the old site into markup this site's editor understands.
 *
 * A picture that arrives as a bare `<img>` is invisible to the panel: the rich-text editor knows one
 * image node, the figure block it writes itself, and anything else in the text is dropped the first
 * time a person saves the material. So the file pass does not merely swap addresses — it rebuilds
 * every picture as the block the editor produces, carrying the Media Library id with it, and moves
 * the lead picture out of the text into the material's own «Main Image» field, which is where the
 * public page reads its header image from.
 *
 * Only markup the HTML cleaner already allows is emitted, and the caller runs the result through it
 * again, so a rewritten text is no less safe than one written in the panel.
 */

const IMG_TAG = /<img\b[^>]*>/gi;
const PARAGRAPH = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
const LEAD_PICTURE = /^<p\b[^>]*>\s*<img\b[^>]*>\s*<\/p>/i;
const CAPTION_AFTER = /^\s*<p>\s*<em>([\s\S]*?)<\/em>\s*<\/p>/i;
const ANCHOR = /<a\b[^>]*\bhref="([^"]*)"[^>]*>/gi;

export interface Picture {
  src: string;
  alt: string;
}

/** One attribute of a tag as written, with the entities the old site printed left alone. */
function attribute(tag: string, name: string): string {
  const found = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(tag);
  return found?.[1] ?? '';
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The block the editor parses back as its own image node — see components/admin/editor/image-block.tsx. */
export function figureBlock(picture: Picture, mediaId: string, caption = ''): string {
  const src = escapeText(picture.src);
  const alt = escapeText(picture.alt);
  return (
    `<figure data-image="" class="tiptap-figure" style="text-align:center">` +
    `<img src="${src}" alt="${alt}" data-media-id="${escapeText(mediaId)}" />` +
    `<figcaption>${escapeText(caption)}</figcaption></figure>`
  );
}

export function imageSrcs(html: string): string[] {
  return [...html.matchAll(IMG_TAG)].map((tag) => attribute(tag[0], 'src')).filter(Boolean);
}

export function anchorHrefs(html: string): string[] {
  return [...html.matchAll(ANCHOR)].map((match) => match[1]).filter(Boolean);
}

export interface LeadPicture {
  picture: Picture;
  /** The caption the old site printed under the picture, when it printed one. */
  caption: string;
  /** The text with the picture and its caption line removed; it becomes the material's header image. */
  rest: string;
}

/**
 * The picture the old site stored as the item's own image: the parser placed it at the very top of
 * the text, followed by its caption in italics. A text that does not start that way has no lead.
 */
export function takeLeadPicture(html: string): LeadPicture | null {
  const paragraph = LEAD_PICTURE.exec(html);
  if (!paragraph) return null;
  const tag = /<img\b[^>]*>/i.exec(paragraph[0])?.[0] ?? '';
  const src = attribute(tag, 'src');
  if (!src) return null;
  const after = html.slice(paragraph.index + paragraph[0].length);
  const caption = CAPTION_AFTER.exec(after)?.[1]?.trim() ?? '';
  const consumed = caption ? after.slice(CAPTION_AFTER.exec(after)?.[0].length ?? 0) : after;
  return {
    picture: { src, alt: attribute(tag, 'alt') },
    caption: caption.replace(/<[^>]+>/g, '').trim(),
    rest: `${html.slice(0, paragraph.index)}${consumed}`,
  };
}

/** Markup that carries neither a word nor a file of its own. */
function isEmptyShell(fragment: string): boolean {
  return !fragment.replace(/<[^>]*>/g, ' ').trim() && !/<(img|iframe|video|audio|svg|object|embed)\b/i.test(fragment);
}

/**
 * Every picture of the text as a figure block, with the address the Media Library now serves it from.
 *
 * A paragraph that holds a picture together with words is split — the words stay in their own
 * paragraph, the picture becomes a block of its own — because a figure inside a paragraph is not
 * something the editor can read back, and a draft that loses its pictures on the first save by a
 * person is a worse outcome than a text with one more line break.
 */
export function setPictures(html: string, byOldAddress: Map<string, { url: string; mediaId: string }>): string {
  const figure = (tag: string): string | null => {
    const src = attribute(tag, 'src');
    const found = src ? byOldAddress.get(src) : undefined;
    return found ? figureBlock({ src: found.url, alt: attribute(tag, 'alt') }, found.mediaId) : null;
  };

  const inParagraphs = html.replace(PARAGRAPH, (whole, attrs: string, content: string) => {
    if (!/<img\b/i.test(content)) return whole;
    // A paragraph whose pictures cannot be converted stays exactly as it was written: reflowing text
    // that no transfer touched would cost the material a version for nothing.
    const convertible = [...content.matchAll(IMG_TAG)].filter((tag) => byOldAddress.has(attribute(tag[0], 'src')));
    if (!convertible.length) return whole;
    const parts: string[] = [];
    let cursor = 0;
    for (const match of convertible) {
      const index = match.index ?? 0;
      parts.push(content.slice(cursor, index));
      parts.push(figure(match[0]) ?? match[0]);
      cursor = index + match[0].length;
    }
    parts.push(content.slice(cursor));
    return parts
      .map((part) => {
        // An empty `<span></span>` left beside a moved picture is markup with nothing in it; a picture
        // this pass could not convert is never dropped, because the text must not lose a file.
        if (!part.trim() || isEmptyShell(part)) return '';
        return /^<figure\b/i.test(part.trim()) ? part : `<p${attrs}>${part}</p>`;
      })
      .join('');
  });

  // Pictures that never sat in a paragraph — inside a table cell, or loose between blocks.
  return inParagraphs.replace(IMG_TAG, (tag) => figure(tag) ?? tag);
}

/**
 * The links of the text — a PDF, a DOCX, an image somebody referenced instead of embedding — pointed
 * at the new address of the same file. A link to another institution, Google Drive included, is not
 * a file of this site and is left exactly as the old page wrote it.
 */
export function rewriteAnchors(html: string, byOldAddress: Map<string, string>): string {
  let out = html;
  for (const [old, replacement] of byOldAddress) {
    out = out.split(`"${old}"`).join(`"${replacement}"`);
  }
  return out;
}

/** The line the material pass left where a base64 picture was cut out of the text. */
export function takeInlineNote(html: string, fileName: string, block: string): { html: string; replaced: boolean } {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const note = new RegExp(`<p\\b[^>]*>[\\s\\S]{0,400}?${escaped}[\\s\\S]{0,400}?<\\/p>`, 'i');
  const found = note.exec(html);
  if (!found) return { html, replaced: false };
  return { html: `${html.slice(0, found.index)}${block}${html.slice(found.index + found[0].length)}`, replaced: true };
}
