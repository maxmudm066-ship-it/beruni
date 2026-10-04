import 'server-only';

/** The rules live in an unguarded module so the migration scripts clean imported markup exactly
 *  the way the editor does; this file is the server-side door to them. */
export { OPTIONS, sanitizeContentHtml, htmlToPlainText } from './sanitize-rules';
