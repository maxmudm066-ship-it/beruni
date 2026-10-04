import sanitizeHtml from 'sanitize-html';

const VIDEO_DOMAINS = ['youtube.com', 'youtube-nocookie.com', 'vimeo.com'];

const ALIGN = [/^(left|right|center|justify)$/];

/** Tags the rich-text editor can produce, plus nothing else. Scripts, forms and event
 *  handlers never survive this, because an administrator pasting from Word must not be able
 *  to put executable markup on the public site. */
export const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'span',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark', 'small', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote',
    'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'iframe', 'div',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading', 'class', 'style', 'data-media-id'],
    // Custom image block: figure carries the caption and the chosen width.
    figure: ['class', 'style', 'data-image'],
    figcaption: ['class'],
    iframe: ['src', 'title', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'loading', 'class', 'style'],
    div: ['class', 'data-youtube-video', 'style'],
    p: ['style', 'class'],
    h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'], h6: ['style'],
    td: ['colspan', 'rowspan', 'class'],
    th: ['colspan', 'rowspan', 'scope', 'class'],
    table: ['class'],
    col: ['span'],
    ol: ['start'],
    span: ['style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: true,
  allowedClasses: {
    div: ['tiptap*', 'relative', 'w-full', 'aspect-video'],
    img: ['tiptap*', 'rounded'],
    table: ['tiptap*', 'w-full'],
    td: ['selectedCell'],
    th: ['selectedCell'],
    a: [],
    figure: ['tiptap*', 'my-4'],
    span: [],
  },
  allowedStyles: {
    '*': { 'text-align': ALIGN },
    figure: { 'max-width': [/^\d+px$/], width: [/^\d+px$/], margin: [/^[\d.]+/] },
    img: { width: [/^\d+px$/], height: [/^\d+px$/], 'float': [/^(left|right|none)$/], margin: [/^[\d.]+/], display: [/^(block|inline-block)$/] },
    div: { width: [/^\d+/], 'max-width': [/^\d+/], margin: [/^[\d.]+/], 'aspect-ratio': [/^[\d\s/.]+$/] },
    span: { color: [/^#[0-9a-f]{3,6}$/i] },
  },
  parseStyleAttributes: true,
  allowedIframeDomains: VIDEO_DOMAINS,
  disallowedTagsMode: 'recursiveEscape',
  enforceHtmlBoundary: true,
};

export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html ?? '', OPTIONS).trim();
}

/** Used for listings, search snippets and word counts. */
export function htmlToPlainText(html: string): string {
  const text = sanitizeHtml(html ?? '', { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard' });
  return text.replace(/\s+/g, ' ').trim();
}
