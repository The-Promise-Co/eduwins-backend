import sanitizeHtml from 'sanitize-html';
import fs from 'fs';
import path from 'path';
import logger from './logger';

/**
 * HTML helpers for admin-authored broadcast email content.
 *
 * Bodies come from the admin WYSIWYG editor and are shipped straight to other
 * people's inboxes, so everything is allowlist-sanitized server-side.
 */

const BROADCAST_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr', 'span', 'div',
];

// Anything not allowlisted above is discarded, which covers images, embeds,
// forms, and inline <style>/<script> (base64/remote images break in many
// clients and are a phishing vector).
const EMPTY_TAG_RE = /<(p|div|span|h[1-6]|li|blockquote)(\s+style="[^"]*")?\s*>\s*<\/\1>/gi;

const BROADCAST_ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  span: ['style'],
  div: ['style'],
  p: ['style'],
  h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'], h5: ['style'], h6: ['style'],
  blockquote: ['style'],
};

// Mail clients strip most CSS; only these inline declarations are worth keeping.
const ALLOWED_INLINE_STYLES = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-family',
  'text-align', 'font-style', 'text-decoration', 'line-height', 'margin', 'padding',
]);

export const escapeHtml = (str: string | null | undefined): string =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pruneInlineStyles = (html: string): string =>
  html.replace(/style="([^"]*)"/gi, (_match, declarations: string) => {
    const kept = declarations
      .split(';')
      .map((rule) => rule.trim())
      .filter(Boolean)
      .filter((rule) => {
        const property = rule.split(':')[0];
        return Boolean(property) && ALLOWED_INLINE_STYLES.has(property.trim().toLowerCase());
      });
    return kept.length ? `style="${kept.join('; ')}"` : '';
  });

/**
 * Allowlist-sanitize a WYSIWYG body. Returns '' when nothing survivable is
 * left, which lets callers reject an effectively empty message.
 */
export const sanitizeBroadcastHtml = (raw: string): string => {
  if (!raw || !raw.trim()) return '';

  const cleaned = sanitizeHtml(raw, {
    allowedTags: BROADCAST_ALLOWED_TAGS,
    allowedAttributes: BROADCAST_ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noreferrer noopener' },
      }),
    },
  });

  // Discarded tags leave empty wrappers behind (`<p></p>` where an <img> was).
  let pruned = pruneInlineStyles(cleaned);
  let previous: string;
  do {
    previous = pruned;
    pruned = pruned.replace(EMPTY_TAG_RE, '');
  } while (pruned !== previous);

  return pruned.trim();
};

/**
 * Rough tag stripper for the text/plain alternative part.
 */
export const htmlToText = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * split/join substitution, so `$&` / `$1` sequences inside admin HTML can never
 * be interpreted as replacement patterns (String.replace would expand them).
 */
const substitute = (tpl: string, token: string, value: string): string =>
  tpl.split(`{{${token}}}`).join(value);

const BROADCAST_TEMPLATE = 'admin_broadcast';

const FALLBACK_SHELL = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <div style="background-color:#001A72;border-radius:16px 16px 0 0;padding:24px;">
    <h1 style="margin:0;color:#ffffff;font-size:24px;">Hello {{firstName}}</h1>
  </div>
  <div style="background-color:#ffffff;border:1px solid #E6EAF5;border-top:none;border-radius:0 0 16px 16px;padding:24px;">
    <div style="color:#374151;font-size:15px;line-height:1.7;">{{body}}</div>
    <p style="margin:24px 0 0;color:#6B7280;font-size:13px;">Sent by the Eduwins team to {{roleLabel}} accounts.</p>
  </div>
</div>`;

const shellCache = new Map<string, string>();

const loadShell = (templatesDir: string): string => {
  const cached = shellCache.get(templatesDir);
  if (cached !== undefined) return cached;

  const filePath = path.join(templatesDir, `${BROADCAST_TEMPLATE}.html`);
  if (!fs.existsSync(filePath)) {
    logger.error({ filePath }, 'email.broadcast_template_not_found');
    shellCache.set(templatesDir, FALLBACK_SHELL);
    return FALLBACK_SHELL;
  }

  const shell = fs.readFileSync(filePath, 'utf8');
  shellCache.set(templatesDir, shell);
  return shell;
};

export const hasFirstNameToken = (html: string): boolean => (html || '').includes('{{firstName}}');

/**
 * Turn a plain-text message (legacy 1:1 admin emails) into paragraphs the
 * broadcast shell can carry. Escaping happens here, so the output is safe to
 * feed straight through sanitizeBroadcastHtml.
 */
export const textToBroadcastHtml = (text: string): string =>
  String(text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

/**
 * Wrap a sanitized body in the Eduwins broadcast shell, personalized per
 * recipient. `bodyHtml` must already be sanitized (see sanitizeBroadcastHtml).
 */
export const renderBroadcastEmail = (
  templatesDir: string,
  data: {
    bodyHtml: string;
    firstName?: string;
    roleLabel?: string;
  },
): string =>
  substitute(
    substitute(
      substitute(loadShell(templatesDir), 'body', data.bodyHtml || ''),
      'firstName',
      escapeHtml(data.firstName || 'there'),
    ),
    'roleLabel',
    escapeHtml(data.roleLabel || 'Eduwins'),
  );

